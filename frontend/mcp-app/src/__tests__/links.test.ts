import { afterEach, describe, expect, it, vi } from 'vitest'
import { installLinkDelegation } from '../links'

function setup(href: string) {
  const root = document.createElement('div')
  root.innerHTML = `<p><a href="${href}" target="_blank" rel="noopener noreferrer"><span>source</span></a></p>`
  document.body.appendChild(root)
  return { root, inner: root.querySelector('span')! }
}

function click(el: Element): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  el.dispatchEvent(event)
  return event
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('installLinkDelegation', () => {
  it('routes an http(s) anchor click through openLink and prevents the raw navigation', async () => {
    const { root, inner } = setup('https://www.instagram.com/reel/abc')
    const openLink = vi.fn().mockResolvedValue(true)
    installLinkDelegation(root, openLink)
    const event = click(inner)
    expect(event.defaultPrevented).toBe(true)
    expect(openLink).toHaveBeenCalledWith('https://www.instagram.com/reel/abc')
  })

  it('leaves the anchor default alone when the host has no open-link support', () => {
    const { root, inner } = setup('https://example.com/')
    installLinkDelegation(root, null)
    expect(click(inner).defaultPrevented).toBe(false)
  })

  it('never opens a non-http(s) href', () => {
    const { root, inner } = setup('javascript:alert(1)')
    const openLink = vi.fn().mockResolvedValue(true)
    installLinkDelegation(root, openLink)
    expect(click(inner).defaultPrevented).toBe(true)
    expect(openLink).not.toHaveBeenCalled()
  })

  it('stops routing after cleanup', () => {
    const { root, inner } = setup('https://example.com/')
    const openLink = vi.fn().mockResolvedValue(true)
    installLinkDelegation(root, openLink)()
    click(inner)
    expect(openLink).not.toHaveBeenCalled()
  })

  it('does not override a host refusal', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { root, inner } = setup('https://example.com/')
    installLinkDelegation(root, vi.fn().mockResolvedValue(false))
    expect(click(inner).defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(warn).toHaveBeenCalled())
    warn.mockRestore()
  })
})
