import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createPortalSaves } from './portalSaves.ts'

const settle = () => new Promise(r => setImmediate(r))

/**
 * A client's portal: what is on screen (by option), and a stand-in for the
 * server that records every request. `failNext` makes the next one fail.
 */
function portal() {
  const screen: Record<string, Array<{ id: string; xF: number; yF: number; visible: boolean }>> = {
    'living:A': [{ id: 'p1', xF: 0.2, yF: 0.5, visible: true }, { id: 'p2', xF: 0.7, yF: 0.5, visible: true }],
    'living:B': [{ id: 'p3', xF: 0.5, yF: 0.5, visible: true }],
  }
  const sent: Array<[string, unknown]> = []
  const told: string[] = []
  let failNext = false
  const saves = createPortalSaves({
    send: async (action, payload) => {
      if (failNext) { failNext = false; throw new Error('offline') }
      sent.push([action, payload])
    },
    artworksOn: (elevId, opt) => screen[`${elevId}:${opt}`] ?? [],
    showAgain: (elevId, opt, artId, visible) => {
      screen[`${elevId}:${opt}`] = screen[`${elevId}:${opt}`].map(a => (a.id === artId ? { ...a, visible } : a))
    },
    tell: msg => told.push(msg),
  })
  const toggle = (key: string, artId: string) => {
    const [elevId, opt] = key.split(':')
    const art = screen[key].find(a => a.id === artId)!
    saves.toggled(elevId, opt, artId, art.visible)
    screen[key] = screen[key].map(a => (a.id === artId ? { ...a, visible: !a.visible } : a))
  }
  const move = (key: string, artId: string, xF: number) => {
    const [elevId, opt] = key.split(':')
    screen[key] = screen[key].map(a => (a.id === artId ? { ...a, xF } : a))
    saves.moved(elevId, opt)
  }
  return { saves, screen, sent, told, toggle, move, failNextSend: () => { failNext = true } }
}

describe('portal saves', () => {
  test('a burst of show/hide clicks sends one save with where it ended; an even number sends none', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const p = portal()

    p.toggle('living:A', 'p1')
    p.toggle('living:A', 'p1')
    p.toggle('living:A', 'p1')
    p.toggle('living:A', 'p2')
    p.toggle('living:A', 'p2')
    t.mock.timers.tick(500)
    await settle()

    assert.deepEqual(p.sent, [['toggle_visibility', { artworkId: 'p1', visible: false }]])
    p.saves.dispose()
  })

  test('if a show/hide does not save, the work goes back to how it is saved, and the client is told', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const p = portal()

    p.toggle('living:A', 'p2')
    assert.equal(p.screen['living:A'][1].visible, false, 'hidden on screen at once')
    p.failNextSend()
    t.mock.timers.tick(500)
    await settle()

    assert.equal(p.screen['living:A'][1].visible, true)
    assert.deepEqual(p.told, ['Failed to update visibility. Please try again.'])
    p.saves.dispose()
  })

  test('moving works on one option and then another before the pause saves both', async (t) => {
    // There used to be one timer for every option: the second move restarted
    // it for option B, and option A's arrangement was never sent.
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const p = portal()

    p.move('living:A', 'p1', 0.3)
    t.mock.timers.tick(300)
    p.move('living:B', 'p3', 0.6)
    t.mock.timers.tick(600)
    await settle()

    assert.deepEqual(p.sent, [
      ['move_artworks', { artworks: [{ id: 'p1', xF: 0.3, yF: 0.5 }, { id: 'p2', xF: 0.7, yF: 0.5 }] }],
      ['move_artworks', { artworks: [{ id: 'p3', xF: 0.6, yF: 0.5 }] }],
    ])
    p.saves.dispose()
  })

  test('a flurry of moves on one option is one save, with where the works ended up', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const p = portal()

    p.move('living:A', 'p1', 0.3)
    t.mock.timers.tick(200)
    p.move('living:A', 'p1', 0.35)
    t.mock.timers.tick(200)
    p.move('living:A', 'p2', 0.8)
    t.mock.timers.tick(600)
    await settle()

    assert.deepEqual(p.sent, [
      ['move_artworks', { artworks: [{ id: 'p1', xF: 0.35, yF: 0.5 }, { id: 'p2', xF: 0.8, yF: 0.5 }] }],
    ])
    p.saves.dispose()
  })

  test('before a pick or an approval, the arrangement on screen is sent at once', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const p = portal()

    await p.saves.sendPositionsNow('living', 'B')

    assert.deepEqual(p.sent, [['move_artworks', { artworks: [{ id: 'p3', xF: 0.5, yF: 0.5 }] }]])
    p.saves.dispose()
  })
})
