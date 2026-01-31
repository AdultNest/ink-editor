/**
 * End-to-end tests for node position persistence
 *
 * These tests verify that:
 * 1. Positions are loaded correctly from file
 * 2. Moving nodes doesn't cause a full reload (preserves selection)
 * 3. Positions are persisted to file correctly
 * 4. Structural changes vs position-only changes are handled correctly
 */

import { describe, it, expect } from 'vitest';
import { parseInk } from '../parser';
import {
  updateKnotPositions,
  updateStartPosition,
  updateEndPosition,
  updateRegionPositions,
} from '../parser/inkGenerator';
import type { ParsedInk, InkKnot, InkRegion, NodePosition } from '../parser/inkTypes';

describe('Node position persistence', () => {
  describe('Position parsing from file', () => {
    it('should parse knot positions from position comments', () => {
      const content = `=== start ===
// <{ "pos-x": 150.5, "pos-y": 200.3 }>
Hello world
-> END`;
      const parsed = parseInk(content);

      expect(parsed.knots).toHaveLength(1);
      expect(parsed.knots[0].position).toBeDefined();
      expect(parsed.knots[0].position?.x).toBeCloseTo(150.5);
      expect(parsed.knots[0].position?.y).toBeCloseTo(200.3);
    });

    it('should parse start node position', () => {
      const content = `// <# start: { "pos-x": 50.0, "pos-y": 100.0 } #>
-> main

=== main ===
Content`;
      const parsed = parseInk(content);

      expect(parsed.startPosition).toBeDefined();
      expect(parsed.startPosition?.x).toBeCloseTo(50);
      expect(parsed.startPosition?.y).toBeCloseTo(100);
    });

    it('should parse end node position', () => {
      const content = `// <# end: { "pos-x": 800.0, "pos-y": 100.0 } #>
=== main ===
Content
-> END`;
      const parsed = parseInk(content);

      expect(parsed.endPosition).toBeDefined();
      expect(parsed.endPosition?.x).toBeCloseTo(800);
      expect(parsed.endPosition?.y).toBeCloseTo(100);
    });

    it('should parse region positions', () => {
      const content = `// <# StartRegion: Test Group #>
// <{ "pos-x": 300.0, "pos-y": 150.0 }>

=== knot_in_region ===
Content

// <# EndRegion #>`;
      const parsed = parseInk(content);

      expect(parsed.regions).toHaveLength(1);
      expect(parsed.regions[0].name).toBe('Test Group');
      expect(parsed.regions[0].position).toBeDefined();
      expect(parsed.regions[0].position?.x).toBeCloseTo(300);
      expect(parsed.regions[0].position?.y).toBeCloseTo(150);
    });

    it('should handle file with all position types', () => {
      const content = `// <# start: { "pos-x": 50.0, "pos-y": 100.0 } #>
// <# end: { "pos-x": 1200.0, "pos-y": 100.0 } #>
-> start

// <# StartRegion: Introduction #>
// <{ "pos-x": 200.0, "pos-y": 50.0 }>

=== start ===
// <{ "pos-x": 250.0, "pos-y": 100.0 }>
Hello!
* [Continue] -> middle

// <# EndRegion #>

=== middle ===
// <{ "pos-x": 600.0, "pos-y": 100.0 }>
Middle content
-> END`;
      const parsed = parseInk(content);

      // Start position
      expect(parsed.startPosition?.x).toBeCloseTo(50);
      expect(parsed.startPosition?.y).toBeCloseTo(100);

      // End position
      expect(parsed.endPosition?.x).toBeCloseTo(1200);
      expect(parsed.endPosition?.y).toBeCloseTo(100);

      // Region position
      expect(parsed.regions).toHaveLength(1);
      expect(parsed.regions[0].position?.x).toBeCloseTo(200);
      expect(parsed.regions[0].position?.y).toBeCloseTo(50);

      // Knot positions
      const startKnot = parsed.knots.find(k => k.name === 'start');
      expect(startKnot?.position?.x).toBeCloseTo(250);
      expect(startKnot?.position?.y).toBeCloseTo(100);

      const middleKnot = parsed.knots.find(k => k.name === 'middle');
      expect(middleKnot?.position?.x).toBeCloseTo(600);
      expect(middleKnot?.position?.y).toBeCloseTo(100);
    });
  });

  describe('Position updates to file', () => {
    it('should update knot positions in content', () => {
      const content = `=== start ===
// <{ "pos-x": 100.0, "pos-y": 100.0 }>
Hello
-> END`;
      const parsed = parseInk(content);
      const positions = new Map<string, NodePosition>();
      positions.set('start', { x: 250, y: 350 });

      const updated = updateKnotPositions(content, positions, parsed.knots);

      // Verify the position was updated
      expect(updated).toContain('"pos-x": 250.0');
      expect(updated).toContain('"pos-y": 350.0');
      expect(updated).not.toContain('"pos-x": 100.0');
    });

    it('should add position comment if none exists', () => {
      const content = `=== start ===
Hello
-> END`;
      const parsed = parseInk(content);
      const positions = new Map<string, NodePosition>();
      positions.set('start', { x: 200, y: 300 });

      const updated = updateKnotPositions(content, positions, parsed.knots);

      expect(updated).toContain('// <{ "pos-x": 200.0, "pos-y": 300.0 }>');
    });

    it('should update start node position', () => {
      const content = `// <# start: { "pos-x": 50.0, "pos-y": 100.0 } #>
-> main

=== main ===
Content`;
      const updated = updateStartPosition(content, { x: 75, y: 125 });

      expect(updated).toContain('"pos-x": 75.0');
      expect(updated).toContain('"pos-y": 125.0');
      expect(updated).not.toContain('"pos-x": 50.0');
    });

    it('should add start position if none exists', () => {
      const content = `-> main

=== main ===
Content`;
      const updated = updateStartPosition(content, { x: 100, y: 200 });

      expect(updated).toContain('// <# start: { "pos-x": 100.0, "pos-y": 200.0 } #>');
    });

    it('should update end node position', () => {
      const content = `// <# end: { "pos-x": 800.0, "pos-y": 100.0 } #>
=== main ===
-> END`;
      const updated = updateEndPosition(content, { x: 900, y: 150 });

      expect(updated).toContain('"pos-x": 900.0');
      expect(updated).toContain('"pos-y": 150.0');
      expect(updated).not.toContain('"pos-x": 800.0');
    });

    it('should update region positions', () => {
      const content = `// <# StartRegion: Test #>
// <{ "pos-x": 100.0, "pos-y": 100.0 }>

=== knot ===
Content

// <# EndRegion #>`;
      const parsed = parseInk(content);
      const positions = new Map<string, NodePosition>();
      positions.set('Test', { x: 200, y: 250 });

      const updated = updateRegionPositions(content, positions, parsed.regions);

      // Should have the new position
      const reParsed = parseInk(updated);
      expect(reParsed.regions[0].position?.x).toBeCloseTo(200);
      expect(reParsed.regions[0].position?.y).toBeCloseTo(250);
    });
  });

  describe('Position preservation during edits', () => {
    it('should preserve knot body content when updating position', () => {
      const content = `=== start ===
// <{ "pos-x": 100.0, "pos-y": 100.0 }>
This is the original content.
It has multiple lines.
* [Choice 1] -> other
* [Choice 2] -> END

=== other ===
Other content`;
      const parsed = parseInk(content);
      const positions = new Map<string, NodePosition>();
      positions.set('start', { x: 500, y: 600 });

      const updated = updateKnotPositions(content, positions, parsed.knots);
      const reParsed = parseInk(updated);

      // Position should be updated
      expect(reParsed.knots[0].position?.x).toBeCloseTo(500);
      expect(reParsed.knots[0].position?.y).toBeCloseTo(600);

      // Content should be preserved
      expect(reParsed.knots[0].bodyContent).toContain('This is the original content.');
      expect(reParsed.knots[0].bodyContent).toContain('It has multiple lines.');
      expect(reParsed.knots[0].choices).toHaveLength(2);
    });

    it('should handle multiple position updates in sequence', () => {
      let content = `=== start ===
// <{ "pos-x": 100.0, "pos-y": 100.0 }>
Content
-> END`;
      let parsed = parseInk(content);

      // First update
      const pos1 = new Map<string, NodePosition>();
      pos1.set('start', { x: 200, y: 200 });
      content = updateKnotPositions(content, pos1, parsed.knots);
      parsed = parseInk(content);
      expect(parsed.knots[0].position?.x).toBeCloseTo(200);

      // Second update
      const pos2 = new Map<string, NodePosition>();
      pos2.set('start', { x: 300, y: 300 });
      content = updateKnotPositions(content, pos2, parsed.knots);
      parsed = parseInk(content);
      expect(parsed.knots[0].position?.x).toBeCloseTo(300);

      // Third update
      const pos3 = new Map<string, NodePosition>();
      pos3.set('start', { x: 400, y: 400 });
      content = updateKnotPositions(content, pos3, parsed.knots);
      parsed = parseInk(content);
      expect(parsed.knots[0].position?.x).toBeCloseTo(400);
    });
  });

  describe('Structural fingerprint detection', () => {
    it('should detect when nodes are added', () => {
      const content1 = `=== start ===
Content`;
      const content2 = `=== start ===
Content

=== new_knot ===
New content`;

      const parsed1 = parseInk(content1);
      const parsed2 = parseInk(content2);

      const fingerprint1 = parsed1.knots.map(k => k.name).sort().join(',');
      const fingerprint2 = parsed2.knots.map(k => k.name).sort().join(',');

      expect(fingerprint1).not.toBe(fingerprint2);
      expect(fingerprint1).toBe('start');
      expect(fingerprint2).toBe('new_knot,start');
    });

    it('should detect when nodes are removed', () => {
      const content1 = `=== start ===
Content

=== other ===
Other`;
      const content2 = `=== start ===
Content`;

      const parsed1 = parseInk(content1);
      const parsed2 = parseInk(content2);

      const fingerprint1 = parsed1.knots.map(k => k.name).sort().join(',');
      const fingerprint2 = parsed2.knots.map(k => k.name).sort().join(',');

      expect(fingerprint1).not.toBe(fingerprint2);
    });

    it('should NOT detect change when only positions change', () => {
      const content1 = `=== start ===
// <{ "pos-x": 100.0, "pos-y": 100.0 }>
Content`;
      const content2 = `=== start ===
// <{ "pos-x": 500.0, "pos-y": 500.0 }>
Content`;

      const parsed1 = parseInk(content1);
      const parsed2 = parseInk(content2);

      const fingerprint1 = parsed1.knots.map(k => k.name).sort().join(',');
      const fingerprint2 = parsed2.knots.map(k => k.name).sort().join(',');

      // Fingerprints should be the same - only positions changed
      expect(fingerprint1).toBe(fingerprint2);

      // But the actual positions should be different
      expect(parsed1.knots[0].position?.x).not.toBe(parsed2.knots[0].position?.x);
    });

    it('should NOT detect change when content changes but structure stays same', () => {
      const content1 = `=== start ===
Original content
-> END`;
      const content2 = `=== start ===
Modified content with more text
-> END`;

      const parsed1 = parseInk(content1);
      const parsed2 = parseInk(content2);

      const fingerprint1 = parsed1.knots.map(k => k.name).sort().join(',');
      const fingerprint2 = parsed2.knots.map(k => k.name).sort().join(',');

      // Fingerprints should be the same - same structure
      expect(fingerprint1).toBe(fingerprint2);
    });
  });

  describe('Complex scenarios', () => {
    it('should handle grouped-chat.ink style file correctly', () => {
      const content = `// <# end: { "pos-x": 3395.7, "pos-y": -500.2 } #>
// Sample ink file with region grouping
-> start

// <# StartRegion: Introduction #>

=== start ===
// <{ "pos-x": 150.0, "pos-y": 100.0 }>
Hello!
* [Good response] -> good_response
* [Bad response] -> bad_response

=== good_response ===
// <{ "pos-x": 150.0, "pos-y": 400.0 }>
That's great!
-> END

=== bad_response ===
// <{ "pos-x": 550.0, "pos-y": 400.0 }>
Sorry to hear that
-> END

// <# EndRegion #>`;

      const parsed = parseInk(content);

      // Check end position
      expect(parsed.endPosition?.x).toBeCloseTo(3395.7);
      expect(parsed.endPosition?.y).toBeCloseTo(-500.2);

      // Check region
      expect(parsed.regions).toHaveLength(1);
      expect(parsed.regions[0].name).toBe('Introduction');
      expect(parsed.regions[0].knotNames).toContain('start');
      expect(parsed.regions[0].knotNames).toContain('good_response');
      expect(parsed.regions[0].knotNames).toContain('bad_response');

      // Check knot positions
      const startKnot = parsed.knots.find(k => k.name === 'start');
      expect(startKnot?.position?.x).toBeCloseTo(150);
      expect(startKnot?.position?.y).toBeCloseTo(100);

      const goodKnot = parsed.knots.find(k => k.name === 'good_response');
      expect(goodKnot?.position?.x).toBeCloseTo(150);
      expect(goodKnot?.position?.y).toBeCloseTo(400);

      const badKnot = parsed.knots.find(k => k.name === 'bad_response');
      expect(badKnot?.position?.x).toBeCloseTo(550);
      expect(badKnot?.position?.y).toBeCloseTo(400);
    });

    it('should update multiple node positions atomically', () => {
      const content = `=== a ===
// <{ "pos-x": 100.0, "pos-y": 100.0 }>
A
-> b

=== b ===
// <{ "pos-x": 200.0, "pos-y": 100.0 }>
B
-> c

=== c ===
// <{ "pos-x": 300.0, "pos-y": 100.0 }>
C
-> END`;
      const parsed = parseInk(content);

      // Update all positions at once
      const positions = new Map<string, NodePosition>();
      positions.set('a', { x: 150, y: 150 });
      positions.set('b', { x: 350, y: 250 });
      positions.set('c', { x: 550, y: 350 });

      const updated = updateKnotPositions(content, positions, parsed.knots);
      const reParsed = parseInk(updated);

      expect(reParsed.knots.find(k => k.name === 'a')?.position?.x).toBeCloseTo(150);
      expect(reParsed.knots.find(k => k.name === 'b')?.position?.x).toBeCloseTo(350);
      expect(reParsed.knots.find(k => k.name === 'c')?.position?.x).toBeCloseTo(550);
    });
  });
});
