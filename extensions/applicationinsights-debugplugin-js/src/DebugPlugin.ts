/**
 * DebugPlugin.ts
 * @copyright Microsoft 2020
 */

import {
  BaseTelemetryPlugin, IConfiguration, CoreUtils,
  IAppInsightsCore, IPlugin, ITelemetryItem, IProcessTelemetryContext, _InternalLogMessage, LoggingSeverity, _InternalMessageId, getNavigator,
  ITelemetryPluginChain, InstrumentFunc, IInstrumentHooksCallbacks, IInstrumentCallDetails, InstrumentFuncs
} from '@microsoft/applicationinsights-core-js';
import { LoggerElement } from './components/helpers';
import { tempStyle, permStyle } from './components/styleNodeSrc';
import { DebugBin, DebugBinParent } from './components/debugBins';


export default class DebugPlugin extends BaseTelemetryPlugin {
  /**
   * the root element of the logger
   */
  public myRootElement: HTMLDivElement;

  /**
   * the logging element
   */
  public myLogger: LoggerElement;

  /**
   * the style that is only on the webpage when the log is active
   */
  public myTempStyle: HTMLStyleElement;

  /**
   * the style that will be permanently embedded in the webpage
   * TODO: manage style conflicts (prepend unique ID to relevant class names?)
   */
  public myPermStyle: HTMLStyleElement;

  /**
   * an object containing the individual debug bin items
   */
  public debugBins: {
    [key: string]: DebugBin;
  };

  /**
   * the different telemetry functions that will be tracked
   */
  public trackers?: string[];

  /**
   * appinsights analytics extension instance. useful methods on __proto__
   */
  public analyticsExt?: IPlugin;

  /**
   * ajax dependency extension instance. useful methods on __proto__
   */
  public ajaxDependencyExt?: IPlugin;

  /**
   * appinsights properties extension instance. useful methods on __proto__
   */
  public propertiesExt?: IPlugin;

  /**
   * appinsights channel extension instance.
   */
  public channelPluginExt?: IPlugin;

  /**
   * timestamp used to track number of seconds since webpage was loaded
   */
  public startTime = +new Date();

  constructor(
    trackers?: string[],
  ) {
    super();
    this.trackers = trackers;
  }

  initialize(config: IConfiguration, core: IAppInsightsCore, extensions: IPlugin[], pluginChain?: ITelemetryPluginChain) {
    super.initialize(config, core, extensions, pluginChain);
    // TODO: anti-crash checks
    // TODO: aria attributes
    // TODO: finalize structure
    // TODO: hook the send function to compare what goes in and what comes out
    // TODO: get trackers from config instead of in constructor

    for (let i = 0; i < extensions.length; i++) {
      if (extensions[i].identifier === 'ApplicationInsightsAnalytics') {
        this.analyticsExt = extensions[i];
      }
      else if (extensions[i].identifier === 'AjaxDependencyPlugin') {
        this.ajaxDependencyExt = extensions[i];
      }
      else if (extensions[i].identifier === 'AppInsightsPropertiesPlugin') {
        this.propertiesExt = extensions[i];
      }
      else if (extensions[i].identifier === 'AppInsightsChannelPlugin') {
        this.channelPluginExt = extensions[i];
      }
    }

    if (!this.trackers) {
      this.trackers = [
        'trackEvent',
        'trackPageView',
        'trackPageViewPerformance',
        'trackException',
        'trackTrace',
        'trackMetric',
        'trackDependencyData',
        'throwInternal',
        'logInternalMessage',
        'triggerSend',
        '_sender',
      ];
    }

    const debugBinContainer = document.createElement("div");
    debugBinContainer.className = 'debug-bin-container';

    const debugBinParent = new DebugBinParent(debugBinContainer, [], 0);

    const diagLog = this.diagLog();

    this.debugBins = {};
    // this is horrible and verbose and I hate it but i'm not quite sure how to condense it further
    const propertiesProtoFns: string[] = [];
    const analyticsProtoFns: string[] = [];
    const ajaxProtoFns: string[] = [];
    const channelProtoFns: string[] = [];
    const diagLogProtoFns: string[] = [];
    for (const [ext, protoFns] of [
      [this.analyticsExt, analyticsProtoFns],
      [this.propertiesExt, propertiesProtoFns],
      [this.ajaxDependencyExt, ajaxProtoFns],
      [this.channelPluginExt, channelProtoFns],
      [diagLog, diagLogProtoFns]
    ] as any[]) {
      for (const key of CoreUtils.objKeys(ext['__proto__'])) {
        if (key.substring(0, 1) === '_') { continue; }
        if (CoreUtils.isTypeof(ext[key], 'function')) {
          protoFns.push(key);
        }
      }
      // special case for sender
      if (ext.identifier === 'AppInsightsChannelPlugin' && CoreUtils.arrIndexOf(this.trackers, '_sender') !== -1) {
        protoFns.push('_sender');
      }
    }

    for (let i = 0; i < this.trackers.length; i++) {
      const tracker = this.trackers[i];
      let target;
      if (CoreUtils.arrIndexOf(propertiesProtoFns, tracker) !== -1) { target = this.propertiesExt['__proto__'] }
      else if (CoreUtils.arrIndexOf(analyticsProtoFns, tracker) !== -1) { target = this.analyticsExt['__proto__'] }
      else if (CoreUtils.arrIndexOf(ajaxProtoFns, tracker) !== -1) { target = this.ajaxDependencyExt['__proto__'] }
      else if (CoreUtils.arrIndexOf(diagLogProtoFns, tracker) !== -1) { target = diagLog['__proto__'] }
      // special case for sender
      else if (tracker === '_sender') { target = this.channelPluginExt }
      else if (CoreUtils.arrIndexOf(channelProtoFns, tracker) !== -1) { target = this.channelPluginExt['__proto__'] }
      else { continue; }
      InstrumentFunc(target, tracker, {
        req: this.preProcessItem(tracker),
        rsp: this.postProcessItem(tracker)
      });

      this.debugBins[tracker] = new DebugBin(tracker, 0, debugBinParent, (i + 1) * 50);
      this.debugBins[tracker].render();
    }

    const permStyleEl = this.myPermStyle = document.createElement("style");
    permStyleEl.innerHTML = permStyle;
    document.head.appendChild(permStyleEl);

    const tempStyleEl = this.myTempStyle = document.createElement("style");
    tempStyleEl.innerHTML = tempStyle;
    const rootEl = this.myRootElement = document.createElement("div");
    // TODO: research more accessibility (aria)
    rootEl.style.position = 'fixed';
    rootEl.style.width = '100vw';
    rootEl.style.height = '100vh';
    rootEl.style.backgroundColor = '#ffffff';
    rootEl.style.opacity = '0';
    rootEl.style.pointerEvents = 'none';
    rootEl.style.top = '-100%';
    rootEl.style.transition = '.2s top cubic-bezier(0.87, 0, 0.13, 1)';
    document.addEventListener("keyup", (evt: KeyboardEvent) => {
      evt.preventDefault();
      if (evt.key === 'd' ) {
        rootEl.style.top = (rootEl.style.opacity === '0') ? '0%' : '-100%';
        rootEl.style.pointerEvents = (rootEl.style.opacity === '0') ? 'auto' : 'none';

        if (rootEl.style.opacity === '0') {
          document.head.appendChild(tempStyleEl);
        } else {
          document.head.removeChild(tempStyleEl);
        }

        rootEl.style.opacity = (rootEl.style.opacity === '0') ? '1' : '0';
      }
    })
    const logHeading = document.createElement("h1");
    logHeading.textContent = 'event logger or something';
    logHeading.style.textAlign = 'center';
    rootEl.appendChild(logHeading);

    const loggerEl = this.myLogger = new LoggerElement(rootEl);

    document.body.appendChild(
      rootEl
    );

    document.body.appendChild(
      debugBinContainer
    );

    // find a way to log
    // - config
    // - extensions
    // - ai sdk version

    // asterisk thing to notify of errors
    //
    this.myLogger.newLogEntry(config, `[0s] config`, 0);
  }


  preProcessItem(itemType: string) {
    return (funcArgs: IInstrumentCallDetails, ...orgArgs: any[]) => {
      (this.debugBins[itemType] || this.debugBins.default).increment();
      this.myLogger.newLogEntry(funcArgs, `[${(+new Date() - this.startTime) / 1000}s] ${itemType}`, 0);
      console.log(`[${itemType}] preProcess - funcArgs: `, funcArgs);
      console.log(`[${itemType}] preProcess - orgArgs: `, orgArgs);
    }
  }

  postProcessItem(itemType: string) {
    return (funcArgs: IInstrumentCallDetails, ...orgArgs: any[]) => {
      console.log(`[${itemType}] postProcess - funcArgs: `, funcArgs);
      console.log(`[${itemType}] postProcess - orgArgs: `, orgArgs);
    }
  }

  processTelemetry(event: ITelemetryItem, itemCtx?: IProcessTelemetryContext) {
    console.log(event);
    this.processNext(event, itemCtx);
    this.myLogger.newLogEntry(event, `[${(+new Date() - this.startTime) / 1000}s] ${event.baseType}`, 0);
  }
}