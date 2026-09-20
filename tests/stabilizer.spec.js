import { test, expect } from '@playwright/test'
import { createMatchStabilizer } from '../src/matching/matchStabilizer.js'

const result = (id, distance) => ({ meme: { id }, comparison: { distance } })

test('the first result is immediate and a challenger must hold its lead', () => {
  const stabilizer = createMatchStabilizer({ holdMs: 900, switchMargin: 0.01 })
  expect(stabilizer.update([result('a', 0.1), result('b', 0.3)], 0)).toEqual({ selectedId: 'a', pendingId: null })
  expect(stabilizer.update([result('b', 0.05), result('a', 0.2)], 400)).toEqual({ selectedId: 'a', pendingId: 'b' })
  expect(stabilizer.update([result('b', 0.04), result('a', 0.2)], 1200)).toEqual({ selectedId: 'a', pendingId: 'b' })
  expect(stabilizer.update([result('b', 0.03), result('a', 0.2)], 1300)).toEqual({ selectedId: 'b', pendingId: null })
})

test('an interrupted lead restarts the hold timer', () => {
  const stabilizer = createMatchStabilizer({ holdMs: 900, switchMargin: 0 })
  stabilizer.update([result('a', 0.1), result('b', 0.2)], 0)
  stabilizer.update([result('b', 0.05), result('a', 0.2)], 100)
  stabilizer.update([result('a', 0.05), result('b', 0.2)], 500)
  expect(stabilizer.update([result('b', 0.05), result('a', 0.2)], 700)).toEqual({ selectedId: 'a', pendingId: 'b' })
  expect(stabilizer.update([result('b', 0.05), result('a', 0.2)], 1500).selectedId).toBe('a')
})

test('small improvements do not start a switch and reset clears the selection', () => {
  const stabilizer = createMatchStabilizer({ holdMs: 0, switchMargin: 0.02 })
  stabilizer.update([result('a', 0.1), result('b', 0.2)], 0)
  expect(stabilizer.update([result('b', 0.09), result('a', 0.1)], 100)).toEqual({ selectedId: 'a', pendingId: null })
  stabilizer.reset()
  expect(stabilizer.update([result('b', 0.2)], 200).selectedId).toBe('b')
})

test('zero hold switches to a clearly stronger result in the same update', () => {
  const stabilizer = createMatchStabilizer({ holdMs: 0, switchMargin: 0.01 })
  stabilizer.update([result('a', 0.2), result('b', 0.3)], 0)
  expect(stabilizer.update([result('b', 0.05), result('a', 0.2)], 100)).toEqual({ selectedId: 'b', pendingId: null })
})

test('zero hold trusts a priority-aware ranking over raw distance', () => {
  const stabilizer = createMatchStabilizer({ holdMs: 0, switchMargin: 0.01 })
  stabilizer.update([{ ...result('face', 0.05), priority: 0 }], 0)
  expect(stabilizer.update([
    { ...result('gesture', 0.2), priority: 1 },
    { ...result('face', 0.05), priority: 0 },
  ], 10)).toEqual({
    selectedId: 'gesture',
    pendingId: null,
  })
})

test('an empty ranking clears held state', () => {
  const stabilizer = createMatchStabilizer()
  stabilizer.update([result('a', 0.1)], 0)
  expect(stabilizer.update([], 100)).toEqual({ selectedId: null, pendingId: null })
  expect(stabilizer.update([result('b', 0.1)], 200).selectedId).toBe('b')
})
