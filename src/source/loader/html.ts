import { AppInterface } from '@micro-app/types'
import { fetchSource } from '../fetch'
import { logError } from '../../libs/utils'

export interface IHTMLLoader {
  run (app: AppInterface, successCb: CallableFunction): void
}

export class HTMLLoader implements IHTMLLoader {
  private static instance: HTMLLoader;
  public static getInstance (): HTMLLoader {
    if (!this.instance) {
      this.instance = new HTMLLoader()
    }
    return this.instance
  }

  /**
   * run logic of load and format html
   * @param successCb success callback
   * @param errorCb error callback, type: (err: Error, meetFetchErr: boolean) => void
   */
  public run (app: AppInterface, successCb: CallableFunction): void {
    const appName = app.name
    const htmlUrl = app.ssrUrl || app.url
    fetchSource(htmlUrl, appName, { cache: 'no-cache' }).then((htmlStr: string) => {
      if (!htmlStr) {
        const msg = 'html is empty, please check in detail'
        app.onerror(new Error(msg))
        return logError(msg, appName)
      }

      htmlStr = this.formatHTML(htmlUrl, htmlStr, app)

      successCb(htmlStr, app)
    }).catch((e) => {
      logError(`Failed to fetch data from ${app.url}, micro-app stop rendering`, appName, e)
      app.onLoadError(e)
    })
  }

  private formatHTML (htmlUrl: string, htmlStr: string, app: AppInterface) {
    return app.plugin.processHtml(htmlStr, htmlUrl)
      .replace(/<head[^>]*>[\s\S]*?<\/head>/i, (match) => {
        return match
          .replace(/<head/i, '<micro-app-head')
          .replace(/<\/head>/i, '</micro-app-head>')
      })
      .replace(/<body[^>]*>[\s\S]*?<\/body>/i, (match) => {
        return match
          .replace(/<body/i, '<micro-app-body')
          .replace(/<\/body>/i, '</micro-app-body>')
      })
  }
}
