/**
 * Runs under Node's own test runner with no build step, so `markdown.ts` must
 * stay free of runtime imports — type-only imports are erased and cost
 * nothing, but a value import of anything that touches Supabase or sharp
 * would take this file with it.
 *
 *   npm test
 *
 * What is pinned here is the *shape* of the document, because the shape is
 * the product. Claude Design reads the pack by its headings and labels; prose
 * it can rewrite, but a heading that quietly stopped being emitted would look
 * exactly like a project with nothing in it.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { buildMarkdown, fileSlug, money } from './markdown.ts'
import type {
  ExportChoices, ExportElevation, ExportSnapshot, ExportWork,
} from './types.ts'

const CHOICES: ExportChoices = {
  optionIds: ['opt1'],
  includeSetAside: false,
  includeWallRenders: true,
  includeWorkImages: true,
  includeThumbnails: false,
}

function work(over: Partial<ExportWork> = {}): ExportWork {
  return {
    id: 'w1', name: 'Street 1', artist: 'Julian Opie', artistId: 'a1',
    wCm: 100, hCm: 70, price: 4500, discountStatus: 'none', discountPercent: null,
    subLineItems: [], year: '2018', medium: 'Screenprint', edition: '12/50',
    source: 'Cristea Roberts', setAside: null, consideredFor: null,
    hangsOn: ['Living Room'], imageFile: 'images/works/street-1.jpg', notes: [],
    ...over,
  }
}

function elevation(over: Partial<ExportElevation> = {}): ExportElevation {
  return {
    id: 'e1', name: 'Living Room', notes: [],
    option: {
      id: 'opt1', title: 'Option A', picked: true,
      wallWCm: 320, wallHCm: 240,
      renderFile: 'images/elevations/living-room.png', thumbnailFile: null,
      workIds: ['w1'], notes: [],
    },
    ...over,
  }
}

function snapshot(over: Partial<ExportSnapshot> = {}): ExportSnapshot {
  return {
    projectName: 'Nepean', clientName: 'Acme', consultantName: 'Tom George',
    exportedAt: '21 September 2026',
    projectNotes: [], elevations: [elevation()], works: [work()],
    artists: [{ id: 'a1', name: 'Julian Opie', notes: [] }],
    budget: null, choices: CHOICES,
    ...over,
  }
}

describe('the document holds its shape', () => {
  test('every top-level section is present, in order', () => {
    const md = buildMarkdown(snapshot())
    const heads = md.split('\n').filter(l => l.startsWith('## '))
    assert.deepEqual(heads, [
      '## The project', '## Elevations', '## Works', '## Also in the project',
    ])
  })

  test('an empty section says so rather than disappearing', () => {
    // A missing heading reads as a broken export. A heading with "Nothing
    // written" under it reads as a consultant who had nothing to add, which
    // is a fact worth carrying downstream.
    const md = buildMarkdown(snapshot({ projectNotes: [] }))
    assert.match(md, /## The project\n\n\*Nothing written\.\*/)
  })

  test('a project with nothing in it still produces every heading', () => {
    const md = buildMarkdown(snapshot({
      elevations: [], works: [], artists: [], projectNotes: [],
    }))
    for (const h of ['## The project', '## Elevations', '## Works', '## Also in the project']) {
      assert.ok(md.includes(h), `missing ${h}`)
    }
    assert.match(md, /\*No works are on the walls in this export\.\*/)
  })

  test('a markdown table is emitted as contiguous rows', () => {
    // A blank line between two rows ends the table, and every row after it
    // renders as literal pipes. This shipped broken once.
    const md = buildMarkdown(snapshot({
      budget: {
        lines: [{ label: 'Street 1', amount: 4500 }, { label: 'Framing', amount: 400, sub: true }],
        total: 4900, totalMax: 4900, clientBudget: null, notes: [],
      },
    }))
    const table = md.slice(md.indexOf('| Line | Amount |'))
    const rows = table.split('\n').slice(0, 5)
    assert.ok(rows.every(r => r.startsWith('|')), `table broken by a blank line:\n${rows.join('\n')}`)
  })

  test('a list is emitted as contiguous items', () => {
    const md = buildMarkdown(snapshot({
      works: [work(), work({ id: 'w2', name: 'Sprinters 1' })],
      elevations: [{
        ...elevation(),
        option: { ...elevation().option, workIds: ['w1', 'w2'] },
      }],
    }))
    const list = md.slice(md.indexOf('**On this wall**'))
    assert.ok(list.includes('- Julian Opie — Street 1 (100 × 70 cm)\n- Julian Opie — Sprinters 1'))
  })
})

describe('what is proposed, and what merely exists', () => {
  test('works on a chosen wall and works that are not are separate sections', () => {
    // Otherwise three prints being put forward and eleven that were only
    // considered read as one list of fourteen.
    const md = buildMarkdown(snapshot({
      works: [work(), work({ id: 'w2', name: 'Sprinters 1', hangsOn: [] })],
    }))
    const proposed = md.slice(md.indexOf('## Works'), md.indexOf('## Also in the project'))
    const rest = md.slice(md.indexOf('## Also in the project'))
    assert.ok(proposed.includes('Street 1'))
    assert.ok(!proposed.includes('Sprinters 1'))
    assert.ok(rest.includes('Sprinters 1'))
  })

  test('when everything is on a wall, the second section says so', () => {
    const md = buildMarkdown(snapshot())
    assert.ok(md.includes('*Nothing else — every work in the project is on a wall here.*'))
  })
})

describe('works', () => {
  test('a work is grouped under its artist', () => {
    const md = buildMarkdown(snapshot({
      works: [work(), work({ id: 'w2', name: 'Sprinters 1' })],
    }))
    assert.equal(md.match(/^### Julian Opie$/gm)?.length, 1)
    assert.ok(md.includes('#### Street 1'))
    assert.ok(md.includes('#### Sprinters 1'))
  })

  test('a work with no note says nothing rather than saying nothing written', () => {
    // The explicit line earns its place on a top-level section. Repeated
    // under every work it is forty lines of noise in a real project.
    const md = buildMarkdown(snapshot())
    const worksPart = md.slice(md.indexOf('## Works'))
    assert.ok(!worksPart.includes('*Nothing written.*'))
    // But the top-level sections keep it.
    assert.ok(md.slice(0, md.indexOf('## Elevations')).includes('*Nothing written.*'))
  })

  test('an extra costing nothing is not listed as a cost', () => {
    const md = buildMarkdown(snapshot({
      works: [work({ subLineItems: [
        { id: 's1', label: 'Framing', kind: 'framing', mode: 'fixed', amount: 400, percent: 0, vatApplies: true },
        { id: 's2', label: '', kind: 'other', mode: 'fixed', amount: 0, percent: 0, vatApplies: true },
      ] })],
    }))
    assert.ok(md.includes('- Framing: £400'))
    assert.ok(!md.includes('other: £0'))
    assert.ok(!md.includes('Other: £0'))
  })

  test('an unlabelled extra falls back to its kind, capitalised', () => {
    const md = buildMarkdown(snapshot({
      works: [work({ subLineItems: [
        { id: 's1', label: '', kind: 'shipping', mode: 'fixed', amount: 120, percent: 0, vatApplies: true },
      ] })],
    }))
    assert.ok(md.includes('- Shipping: £120'))
  })

  test('facts are labelled, so they survive being reordered downstream', () => {
    const md = buildMarkdown(snapshot())
    assert.ok(md.includes('**Size** 100 × 70 cm'))
    assert.ok(md.includes('**Medium** Screenprint'))
    assert.ok(md.includes('**Edition** 12/50'))
    assert.ok(md.includes('**Price** £4,500 ex VAT'))
  })

  test("an artist's standing note sits with their works, once", () => {
    // It used to have a section of its own, which emitted `### Julian Opie`
    // twice at the same level meaning two different things.
    const md = buildMarkdown(snapshot({
      artists: [{ id: 'a1', name: 'Julian Opie', notes: [{ id: 'n1', body: 'Works in flat colour.' }] }],
    }))
    assert.equal(md.match(/^### Julian Opie$/gm)?.length, 1)
    const group = md.slice(md.indexOf('### Julian Opie'), md.indexOf('#### Street 1'))
    assert.ok(group.includes('Works in flat colour.'))
  })

  test('two spellings of one artist do not split into two headings', () => {
    // `works.artist` is a display copy and copies drift — 032 exists because
    // of it. The grouping follows artist_id where there is one.
    const md = buildMarkdown(snapshot({
      works: [work(), work({ id: 'w2', name: 'Sprinters 1', artist: 'julian opie' })],
    }))
    const worksPart = md.slice(md.indexOf('## Works'))
    assert.equal(worksPart.match(/^### /gm)?.length, 1)
    assert.ok(worksPart.includes('#### Sprinters 1'))
  })

  test('an unattributed work is named, not left blank', () => {
    const md = buildMarkdown(snapshot({
      works: [work({ artist: '', artistId: null })], artists: [],
    }))
    assert.ok(md.includes('### Unattributed'))
  })

  test('a work hanging nowhere falls back to what it was earmarked for', () => {
    const md = buildMarkdown(snapshot({
      works: [work({ hangsOn: [], consideredFor: 'Boardroom' })],
    }))
    assert.ok(md.includes('**Considered for** Boardroom'))
    assert.ok(!md.includes('**Hangs on**'))
  })
})

describe('set aside', () => {
  const aside = work({ id: 'w9', name: 'Walking 2', setAside: 'client', hangsOn: [] })

  test('set-aside works are absent unless they were asked for', () => {
    const md = buildMarkdown(snapshot({ works: [work(), aside] }))
    assert.ok(!md.includes('Walking 2'))
    assert.ok(!md.includes('## Set aside'))
  })

  test('when asked for, they are their own section and say who decided', () => {
    const md = buildMarkdown(snapshot({
      works: [work(), aside],
      choices: { ...CHOICES, includeSetAside: true },
    }))
    assert.ok(md.includes('## Set aside'))
    assert.ok(md.includes('**Set aside by** the client'))
    // And they stay out of the main Works section, which is the proposal.
    const worksPart = md.slice(md.indexOf('## Works'), md.indexOf('## Set aside'))
    assert.ok(!worksPart.includes('Walking 2'))
  })

  test('"us" and "client" are never collapsed into one word', () => {
    const md = buildMarkdown(snapshot({
      works: [work({ id: 'w8', setAside: 'us', hangsOn: [] })],
      choices: { ...CHOICES, includeSetAside: true },
    }))
    assert.ok(md.includes('**Set aside by** us'))
  })
})

describe('elevations', () => {
  test('the wall render is referenced from the elevation that owns it', () => {
    const md = buildMarkdown(snapshot())
    assert.ok(md.includes('![Living Room, Option A](images/elevations/living-room.png)'))
  })

  test('an elevation with nothing hung says so', () => {
    const e = elevation()
    const md = buildMarkdown(snapshot({
      elevations: [{ ...e, option: { ...e.option, workIds: [] } }],
    }))
    assert.ok(md.includes('*Nothing hung yet.*'))
  })

  test('the option the client picked is marked', () => {
    assert.ok(buildMarkdown(snapshot()).includes('**Picked by the client** yes'))
  })

  test('an unpicked option carries no verdict either way', () => {
    const e = elevation()
    const md = buildMarkdown(snapshot({
      elevations: [{ ...e, option: { ...e.option, picked: false } }],
    }))
    assert.ok(!md.includes('Picked by the client'))
  })
})

describe('budget', () => {
  test('the difference is stated, never graded', () => {
    // Client-facing language: the export reports the gap and stops. Whether
    // being over is a problem is the consultant's conversation to have.
    const md = buildMarkdown(snapshot({
      budget: {
        lines: [{ label: 'Street 1', amount: 4500 }],
        total: 4500, totalMax: 4500, clientBudget: 4000, notes: [],
      },
    }))
    assert.ok(md.includes('The total is £500 above the budget.'))
    for (const banned of ['over budget', 'overspend', 'too expensive', 'Warning']) {
      assert.ok(!md.includes(banned), `graded the client's budget: ${banned}`)
    }
  })

  test('an exact match is said plainly', () => {
    const md = buildMarkdown(snapshot({
      budget: { lines: [], total: 4000, totalMax: 4000, clientBudget: 4000, notes: [] },
    }))
    assert.ok(md.includes('matches the budget exactly'))
  })

  test('an indicative line is shown as a range, not a single figure', () => {
    const md = buildMarkdown(snapshot({
      budget: {
        lines: [
          { label: 'Street 1', amount: 4500 },
          { label: 'Installation (indicative)', amount: 250, amountMax: 350 },
        ],
        total: 4750, totalMax: 4850, clientBudget: null, notes: [],
      },
    }))
    assert.ok(md.includes('| Installation (indicative) | £250 – £350 |'))
    assert.ok(md.includes('**Total ex VAT** | **£4,750 – £4,850**'))
  })

  test('a range straddling the budget is not called above or below', () => {
    // One end is over and the other under. Saying either would be false at
    // the far end, and saying "over budget" would be a verdict besides.
    const md = buildMarkdown(snapshot({
      budget: {
        lines: [{ label: 'Installation (indicative)', amount: 250, amountMax: 350 }],
        total: 4900, totalMax: 5100, clientBudget: 5000, notes: [],
      },
    }))
    assert.ok(md.includes('runs from £100 below to £100 above'))
    assert.ok(!md.includes('The total is'))
  })

  test('sub-lines are indented under the work they belong to', () => {
    const md = buildMarkdown(snapshot({
      budget: {
        lines: [
          { label: 'Street 1', amount: 4500 },
          { label: 'Framing', amount: 400, sub: true },
        ],
        total: 4900, totalMax: 4900, clientBudget: null, notes: [],
      },
    }))
    assert.ok(md.includes('| &nbsp;&nbsp;↳ Framing | £400 |'))
  })
})

describe('notes', () => {
  test('a note covering several works says what it covers', () => {
    const md = buildMarkdown(snapshot({
      works: [work({ notes: [{ id: 'n1', body: 'Hung as a pair.', covers: '2 works' }] })],
    }))
    assert.ok(md.includes('*About 2 works.* Hung as a pair.'))
  })

  test('note bodies are carried through untouched', () => {
    const body = 'The client asked for something quieter in here.'
    const md = buildMarkdown(snapshot({ projectNotes: [{ id: 'n1', body }] }))
    assert.ok(md.includes(body))
  })
})

describe('filenames', () => {
  test('accents fold rather than vanish', () => {
    assert.equal(fileSlug('Joan Miró'), 'joan-miro')
    assert.equal(fileSlug('Ólafur Elíasson'), 'olafur-eliasson')
  })

  test('punctuation and spacing collapse to single hyphens', () => {
    assert.equal(fileSlug('  Street #1 (A/P)  '), 'street-1-a-p')
  })

  test('a name with nothing usable in it still yields a filename', () => {
    assert.equal(fileSlug('???', 'work'), 'work')
    assert.equal(fileSlug(''), 'untitled')
  })
})

describe('money', () => {
  test('whole pounds, grouped', () => {
    assert.equal(money(4500), '£4,500')
    assert.equal(money(1234567), '£1,234,567')
    assert.equal(money(0), '£0')
  })
})
