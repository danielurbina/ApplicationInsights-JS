﻿/// <reference path="../TestFramework/TestClass.ts" />

import { AppInsightsCore, DiagnosticLogger, ITelemetryItem } from "@microsoft/applicationinsights-core-js";
import { ReactNativePlugin, ReactNativeExceptionPlugin, INativeDevice, IReactNativePluginConfig } from '../../src';

export class ReactNativePluginTests extends TestClass {
    private plugin: ReactNativePlugin;
    private exceptionPlugin: ReactNativeExceptionPlugin;
    private core: AppInsightsCore;
    private config: IReactNativePluginConfig;
    private item: ITelemetryItem;

    public testInitialize() {
        this.core = new AppInsightsCore();
        this.core.logger = new DiagnosticLogger();
        this.plugin = new ReactNativePlugin();
        this.exceptionPlugin = new ReactNativeExceptionPlugin();
        this.config = {};
    }

    public testCleanup() {
        this.core = null;
        this.plugin = null;
        this.exceptionPlugin = null;
        this.config = null;
    }

    public registerTests() {
        this.addConfigTests()
        this.addAPITests();
        this.addProcessTelemetryTests();
    }

    private addProcessTelemetryTests() {
        this.testCase({
            name: 'processTelemetry appends device fields',
            test: () => {
                const expectation: ITelemetryItem = {
                    name: 'a name',
                    ext: {
                        device: {
                            localId: 'some id',
                            model: 'some model',
                            deviceClass: 'some type'
                        }
                    }
                };
                const actual: ITelemetryItem = {
                    name: 'a name'
                };
                this.plugin['_initialized'] = true;
                (this.plugin['_device'] as INativeDevice) = {
                    id: 'some id',
                    model: 'some model',
                    deviceClass: 'some type'
                };
                Assert.notDeepEqual(expectation, actual, 'Telemetry items are not equal yet');
                this.plugin.processTelemetry(actual);
                Assert.deepEqual(expectation, actual, 'Telemetry items are equal');
            }
        });
    }

    private addAPITests() {
        this.testCase({
            name: `setDeviceId sets this device's id`,
            test: () => {
                const expectation = 'something';
                Assert.notEqual(expectation, this.plugin['_device'].id, 'Initial not set');
                this.plugin.setDeviceId(expectation);
                Assert.equal(expectation, this.plugin['_device'].id, 'Value set');
            }
        });

        this.testCase({
            name: `setDeviceModel sets this device's model`,
            test: () => {
                const expectation = 'something';
                Assert.notEqual(expectation, this.plugin['_device'].model, 'Initial not set');
                this.plugin.setDeviceModel(expectation);
                Assert.equal(expectation, this.plugin['_device'].model, 'Value set');
            }
        });

        this.testCase({
            name: `setDeviceType sets this device's type`,
            test: () => {
                const expectation = 'something';
                Assert.notEqual(expectation, this.plugin['_device'].deviceClass, 'Initial not set');
                this.plugin.setDeviceType(expectation);
                Assert.equal(expectation, this.plugin['_device'].deviceClass, 'Value set');
            }
        });
    }

    private addConfigTests() {
        this.testCase({
            name: 'Device Info Autocollection is enabled by default',
            test: () => {
                const autoCollectStub = this.sandbox.stub(this.plugin, '_collectDeviceInfo');

                this.plugin.initialize(this.config, this.core, []);
                Assert.equal(false, this.plugin['_config'].disableDeviceCollection, 'disableDeviceCollection is false');
                Assert.ok(autoCollectStub.calledOnce);
            }
        });

        this.testCase({
            name: 'Exception Autocollection is enabled by default',
            test: () => {
                const autuCollectExceptionStub = this.sandbox.stub(this.exceptionPlugin, '_setExceptionHandlers');

                this.exceptionPlugin.initialize(this.config, this.core, []);
                Assert.equal(false, this.exceptionPlugin['_config'].disableExceptionCollection, 'disableExceptionCollection is false');
                Assert.ok(autuCollectExceptionStub.calledOnce);
            }
        });

        this.testCase({
            name: 'Autocollection does not run when disabled from root config',
            test: () => {
                const autoCollectStub = this.sandbox.stub(this.plugin, '_collectDeviceInfo');
                const autuCollectExceptionStub = this.sandbox.stub(this.exceptionPlugin, '_setExceptionHandlers');

                this.config['disableDeviceCollection'] = true;
                this.config['disableExceptionCollection'] = true;
                this.plugin.initialize(this.config, this.core, []);
                this.exceptionPlugin.initialize(this.config, this.core, []);

                Assert.equal(true, this.plugin['_config'].disableDeviceCollection, 'disableDeviceCollection is true');
                Assert.equal(true, this.exceptionPlugin['_config'].disableExceptionCollection, 'disableExceptionCollection is true');
                Assert.ok(autoCollectStub.notCalled);
                Assert.ok(autuCollectExceptionStub.notCalled);
            }
        });

        this.testCase({
            name: 'Autocollection does not run when disabled from constructor config',
            test: () => {
                this.plugin = new ReactNativePlugin({disableDeviceCollection: true});
                this.exceptionPlugin = new ReactNativeExceptionPlugin({disableExceptionCollection: true});
                const autoCollectStub = this.sandbox.stub(this.plugin, '_collectDeviceInfo');
                const autuCollectExceptionStub = this.sandbox.stub(this.exceptionPlugin, '_setExceptionHandlers');
                this.plugin.initialize(this.config, this.core, []);
                this.exceptionPlugin.initialize(this.config, this.core, []);
                
                Assert.equal(true, this.plugin['_config'].disableDeviceCollection, 'disableDeviceCollection is true');
                Assert.equal(true, this.exceptionPlugin['_config'].disableExceptionCollection, 'disableExceptionCollection is true');
                Assert.ok(autoCollectStub.notCalled);
                Assert.ok(autuCollectExceptionStub.notCalled);
            }
        });

        this.testCase({
            name: 'Autocollection runs when empty config is passed',
            test: () => {
                this.plugin = new ReactNativePlugin({} as any);
                this.exceptionPlugin = new ReactNativeExceptionPlugin({} as any);
                const autoCollectStub = this.sandbox.stub(this.plugin, '_collectDeviceInfo');
                const autuCollectExceptionStub = this.sandbox.stub(this.exceptionPlugin, '_setExceptionHandlers');
                this.plugin.initialize(this.config, this.core, []);
                this.exceptionPlugin.initialize(this.config, this.core, []);

                Assert.equal(false, this.plugin['_config'].disableDeviceCollection, 'disableDeviceCollection is false');
                Assert.equal(false, this.exceptionPlugin['_config'].disableExceptionCollection, 'disableExceptionCollection is false');
                Assert.ok(autoCollectStub.calledOnce);
                Assert.ok(autuCollectExceptionStub.calledOnce);
            }
        });

        this.testCase({
            name: 'Autocollection runs when random config is passed',
            test: () => {
                this.plugin = new ReactNativePlugin({foo: 'bar'} as any);
                this.exceptionPlugin = new ReactNativeExceptionPlugin({foo: 'bar'} as any);
                const autoCollectStub = this.sandbox.stub(this.plugin, '_collectDeviceInfo');
                const autuCollectExceptionStub = this.sandbox.stub(this.exceptionPlugin, '_setExceptionHandlers');
                this.plugin.initialize(this.config, this.core, []);
                this.exceptionPlugin.initialize(this.config, this.core, []);

                Assert.deepEqual(false, this.plugin['_config'].disableDeviceCollection, 'disableDeviceCollection is false');
                Assert.deepEqual(false, this.exceptionPlugin['_config'].disableExceptionCollection, 'disableExceptionCollection is false');
                Assert.ok(autoCollectStub.calledOnce);
                Assert.ok(autuCollectExceptionStub.calledOnce);
            }
        });
    }
}

export function runTests() {
    new ReactNativePluginTests().registerTests();
}
