import type { AppInterface, plugins } from '@micro-app/types'
import { fetchSource } from './fetch'
import {
  logError,
  CompletionPath,
  pureCreateElement,
  isFunction,
  isPlainObject,
} from '../libs/utils'
import { extractLinkFromHtml, fetchLinksFromHtml } from './links'
import { extractScriptElement, fetchScriptsFromHtml } from './scripts'
import scopedCSS from './scoped_css'
import microApp from '../micro_app'

/**
 * transform html string to dom
 * @param str string dom
 */
function getWrapElement (str: string): HTMLElement {
  const wrapDiv = pureCreateElement('div')

  wrapDiv.innerHTML = str

  return wrapDiv
}

/**
 * Recursively process each child element
 * @param parent parent element
 * @param app app
 * @param microAppHead micro-app-head element
 */
function flatChildren (
  parent: HTMLElement,
  app: AppInterface,
  microAppHead: Element,
): void {
  const children = Array.from(parent.children)

  children.length && children.forEach((child) => {
    flatChildren(child as HTMLElement, app, microAppHead)
  })

  for (const dom of children) {
    if (dom instanceof HTMLLinkElement) {
      if (dom.hasAttribute('exclude')) {
        parent.replaceChild(document.createComment('link element with exclude attribute ignored by micro-app'), dom)
      } else if (!dom.hasAttribute('ignore')) {
        extractLinkFromHtml(dom, parent, app)
      } else if (dom.hasAttribute('href')) {
        dom.setAttribute('href', CompletionPath(dom.getAttribute('href')!, app.url))
      }
    } else if (dom instanceof HTMLStyleElement) {
      if (dom.hasAttribute('exclude')) {
        parent.replaceChild(document.createComment('style element with exclude attribute ignored by micro-app'), dom)
      } else if (app.scopecss && !dom.hasAttribute('ignore')) {
        scopedCSS(dom, app)
      }
    } else if (dom instanceof HTMLScriptElement) {
      extractScriptElement(dom, parent, app)
    } else if (dom instanceof HTMLMetaElement || dom instanceof HTMLTitleElement) {
      parent.removeChild(dom)
    } else if (dom instanceof HTMLImageElement && dom.hasAttribute('src')) {
      dom.setAttribute('src', CompletionPath(dom.getAttribute('src')!, app.url))
    }
  }
}

/**
 * Extract link and script, bind style scope
 * @param htmlStr html string
 * @param app app
 */
function extractSourceDom (htmlStr: string, app: AppInterface) {
  const wrapElement = getWrapElement(htmlStr)
  const microAppHead = wrapElement.querySelector('micro-app-head')
  const microAppBody = wrapElement.querySelector('micro-app-body')

  if (!microAppHead || !microAppBody) {
    const msg = `element ${microAppHead ? 'body' : 'head'} is missing`
    app.onerror(new Error(msg))
    return logError(msg, app.name)
  }

  flatChildren(wrapElement, app, microAppHead)

  if (app.source.links.size) {
    fetchLinksFromHtml(wrapElement, app, microAppHead)
  } else {
    app.onLoad(wrapElement)
  }

  if (app.source.scripts.size) {
    fetchScriptsFromHtml(wrapElement, app)
  } else {
    app.onLoad(wrapElement)
  }
}

/**
 * Get and format html
 * @param app app
 */
export default function extractHtml (app: AppInterface): void {
  const appName = app.name
  const htmlUrl = app.ssrUrl || app.url
  fetchSource(htmlUrl, appName, { cache: 'no-cache' }).then((htmlStr: string) => {
    if (!htmlStr) {
      const msg = 'html is empty, please check in detail'
      app.onerror(new Error(msg))
      return logError(msg, appName)
    }

    htmlStr = processHtml(htmlUrl, htmlStr, appName, microApp.plugins ?? {}, app)
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

    extractSourceDom(htmlStr, app)
  }).catch((e) => {
    logError(`Failed to fetch data from ${app.url}, micro-app stop rendering`, appName, e)
    app.onLoadError(e)
  })
}

function processHtml (url: string, code: string, appName: string, plugins: plugins, app: AppInterface): string {
  const mergedPlugins: NonNullable<plugins['global']> = []
  plugins.global && mergedPlugins.push(...plugins.global)
  plugins.modules?.[appName] && mergedPlugins.push(...plugins.modules[appName])

  if (mergedPlugins.length > 0) {
    return mergedPlugins.reduce((preCode, plugin) => {
      if (isPlainObject(plugin) && isFunction(plugin.processHtml)) {
        return plugin.processHtml!(preCode, url, plugin.options, app)
      }
      return preCode
    }, code)
  }
  return code
}
