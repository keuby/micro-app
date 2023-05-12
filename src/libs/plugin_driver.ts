import type { MicroAppPlugin, SandBoxInterface, BuiltinSandBox, plugins } from '@micro-app/types'
import { isArray, isObject, isFunction, logError } from './utils'

export class PluginDriver {
  private plugins: plugins
  // eslint-disable-next-line no-use-before-define
  private cached: Record<string, PluginContext> = {};

  constructor (plugins: plugins = {}) {
    this.plugins = plugins
  }

  setPlugins (plugins: plugins): void {
    this.plugins = plugins
  }

  select (appName: string): PluginContext {
    return this.cached[appName] || (this.cached[appName] = new PluginContext(this, appName))
  }

  getMerge (appName: string, key: string): any {
    return this.getMergedPlugins(appName).reduce((res, plugin) => {
      const propValue = Reflect.get(plugin, key)
      return isObject(propValue) ? Object.assign(res, propValue) : res
    }, {})
  }

  getConcat (appName: string, key: string): any[] {
    return this.getMergedPlugins(appName).reduce((res, plugin) => {
      const propValue = Reflect.get(plugin, key)
      return isArray(propValue) ? res.concat(propValue) : res
    }, [] as any[])
  }

  hookFirstTrue (appName: string, key: string, ...args: unknown[]): boolean {
    const plugins = this.getMergedPlugins(appName)
    return plugins.some((plugin) => {
      const propValue = Reflect.get(plugin, key)
      return propValue && isFunction(propValue)
        ? this.callHook(propValue, appName, args) ?? false
        : false
    })
  }

  hookReduce (appName: string, key: string, ...args: unknown[]): any {
    const plugins = this.getMergedPlugins(appName)
    const [initValue, ...restArgs] = args
    return plugins.reduce((prev, next) => {
      const propValue = Reflect.get(next, key)
      return propValue && isFunction(propValue)
        ? this.callHook(propValue, appName, [prev, ...restArgs]) ?? prev
        : prev
    }, initValue)
  }

  private getMergedPlugins (name: string): MicroAppPlugin[] {
    const globalPlugins = this.plugins.global ?? []
    const modulePlugins = this.plugins.modules?.[name] ?? []
    return [...globalPlugins, ...modulePlugins]
  }

  private callHook (fn: CallableFunction, appName: string, args: unknown[]): unknown {
    try {
      return fn(...args)
    } catch (error) {
      logError(error, appName)
      return undefined
    }
  }
}

export class PluginContext implements Required<MicroAppPlugin> {
  private driver: PluginDriver;
  private appName: string;

  constructor (driver: PluginDriver, appName: string) {
    this.driver = driver
    this.appName = appName
  }

  get options (): Record<string, unknown> {
    return this.driver.getMerge(this.appName, 'options')
  }

  get scopeProperties (): PropertyKey[] {
    return this.driver.getConcat(this.appName, 'scopeProperties')
  }

  get escapeProperties (): PropertyKey[] {
    return this.driver.getConcat(this.appName, 'escapeProperties')
  }

  excludeChecker (url: string): boolean {
    return this.driver.hookFirstTrue(this.appName, 'excludeChecker', url)
  }

  ignoreChecker (url: string): boolean {
    return this.driver.hookFirstTrue(this.appName, 'ignoreChecker', url)
  }

  loader (code: string, url: string): string {
    return this.driver.hookReduce(this.appName, 'loader', code, url)
  }

  processHtml (code: string, url: string): string {
    return this.driver.hookReduce(this.appName, 'processHtml', code, url)
  }

  processSandbox (sandbox: BuiltinSandBox): SandBoxInterface {
    return this.driver.hookReduce(this.appName, 'processSandbox', sandbox)
  }
}

export const pluginDriver = new PluginDriver()
