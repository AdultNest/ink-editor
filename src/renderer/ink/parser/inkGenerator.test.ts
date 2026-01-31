/**
 * Unit tests for the ink generator
 */

import { describe, it, expect } from 'vitest';
import {
  stripPositionComment,
  updateKnotPosition,
  updateKnotContent,
  addKnot,
  deleteKnot,
  addDivert,
  removeDivert,
  updateDivert,
  renameKnot,
  renameRegion,
  generateInk,
  updateKnotPositions,
  moveKnotToRegion,
  addRegion,
  deleteRegion,
} from './inkGenerator';
import { parseInk } from './inkParser';

describe('inkGenerator', () => {
  describe('stripPositionComment', () => {
    it('should remove position comment from start of content', () => {
      const content = `// <{ "pos-x": 100.0, "pos-y": 200.0 }>
Hello world`;
      const result = stripPositionComment(content);

      // Position comment line is removed, rest preserved
      expect(result).toBe('Hello world');
    });

    it('should return unchanged content if no position comment', () => {
      const content = `Hello world
Line two`;
      const result = stripPositionComment(content);

      expect(result).toBe(content);
    });

    it('should handle empty content', () => {
      const result = stripPositionComment('');
      expect(result).toBe('');
    });

    it('should not remove regular comments', () => {
      const content = `// Regular comment
Hello world`;
      const result = stripPositionComment(content);

      expect(result).toBe(content);
    });
  });

  describe('updateKnotPosition', () => {
    it('should add position to knot without existing position', () => {
      const content = `=== start ===
Hello world`;
      const parsed = parseInk(content);
      const result = updateKnotPosition(content, parsed.knots[0], { x: 150, y: 250 });

      expect(result).toContain('// <{ "pos-x": 150.0, "pos-y": 250.0 }>');
    });

    it('should update existing position', () => {
      const content = `=== start ===
// <{ "pos-x": 100.0, "pos-y": 200.0 }>
Hello world`;
      const parsed = parseInk(content);
      const result = updateKnotPosition(content, parsed.knots[0], { x: 300, y: 400 });

      expect(result).toContain('// <{ "pos-x": 300.0, "pos-y": 400.0 }>');
      expect(result).not.toContain('100.0');
    });

    it('should handle negative positions', () => {
      const content = `=== start ===
Hello world`;
      const parsed = parseInk(content);
      const result = updateKnotPosition(content, parsed.knots[0], { x: -50, y: -100 });

      expect(result).toContain('// <{ "pos-x": -50.0, "pos-y": -100.0 }>');
    });
  });

  describe('updateKnotContent', () => {
    it('should update knot body content', () => {
      const content = `=== start ===
Old content`;
      const parsed = parseInk(content);
      const result = updateKnotContent(content, parsed.knots[0], 'New content');

      expect(result).toContain('=== start ===');
      expect(result).toContain('New content');
      expect(result).not.toContain('Old content');
    });

    it('should preserve knot header', () => {
      const content = `=== my_knot ===
Old content`;
      const parsed = parseInk(content);
      const result = updateKnotContent(content, parsed.knots[0], 'New content');

      expect(result).toContain('=== my_knot ===');
    });

    it('should preserve position if knot has one', () => {
      const content = `=== start ===
// <{ "pos-x": 100.0, "pos-y": 200.0 }>
Old content`;
      const parsed = parseInk(content);
      const result = updateKnotContent(content, parsed.knots[0], 'New content');

      // Position should be preserved
      expect(result).toContain('pos-x');
    });

    it('should handle multi-line new content', () => {
      const content = `=== start ===
Old`;
      const parsed = parseInk(content);
      const newContent = `Line 1
Line 2
* Choice -> END`;
      const result = updateKnotContent(content, parsed.knots[0], newContent);

      expect(result).toContain('Line 1');
      expect(result).toContain('Line 2');
      expect(result).toContain('* Choice -> END');
    });

    it('should preserve content before the knot', () => {
      const content = `EXTERNAL Test()

-> start

=== start ===
Content`;
      const parsed = parseInk(content);
      const result = updateKnotContent(content, parsed.knots[0], 'New content');

      expect(result).toContain('EXTERNAL Test()');
      expect(result).toContain('-> start');
    });
  });

  describe('addKnot', () => {
    it('should add new knot to end of file', () => {
      const content = `=== start ===
Hello`;
      const result = addKnot(content, 'new_knot');

      expect(result).toContain('=== new_knot ===');
      expect(result.indexOf('new_knot')).toBeGreaterThan(result.indexOf('start'));
    });

    it('should add knot with position', () => {
      const content = `=== start ===
Hello`;
      const result = addKnot(content, 'new_knot', { x: 100, y: 200 });

      expect(result).toContain('=== new_knot ===');
      expect(result).toContain('// <{ "pos-x": 100.0, "pos-y": 200.0 }>');
    });

    it('should handle empty file', () => {
      const result = addKnot('', 'first_knot');

      expect(result).toContain('=== first_knot ===');
    });

    it('should trim trailing whitespace before adding', () => {
      const content = `=== start ===
Hello


`;
      const result = addKnot(content, 'new_knot');

      // Should not have excessive blank lines
      const newKnotIndex = result.indexOf('=== new_knot ===');
      const beforeNewKnot = result.substring(0, newKnotIndex);
      const trailingNewlines = beforeNewKnot.match(/\n+$/)?.[0].length ?? 0;
      expect(trailingNewlines).toBeLessThanOrEqual(3);
    });
  });

  describe('deleteKnot', () => {
    it('should remove knot from file', () => {
      const content = `=== first ===
Content 1

=== second ===
Content 2`;
      const parsed = parseInk(content);
      const result = deleteKnot(content, parsed.knots[0]);

      expect(result).not.toContain('=== first ===');
      expect(result).not.toContain('Content 1');
      expect(result).toContain('=== second ===');
      expect(result).toContain('Content 2');
    });

    it('should remove middle knot', () => {
      const content = `=== first ===
A

=== middle ===
B

=== last ===
C`;
      const parsed = parseInk(content);
      const result = deleteKnot(content, parsed.knots[1]);

      expect(result).toContain('=== first ===');
      expect(result).not.toContain('=== middle ===');
      expect(result).toContain('=== last ===');
    });

    it('should clean up excessive blank lines', () => {
      const content = `=== first ===
Content



=== second ===
More`;
      const parsed = parseInk(content);
      const result = deleteKnot(content, parsed.knots[0]);

      // Should not have more than 2 consecutive newlines
      expect(result).not.toMatch(/\n{4,}/);
    });
  });

  describe('addDivert', () => {
    it('should add divert to end of knot', () => {
      const content = `=== start ===
Hello

=== target ===
World`;
      const parsed = parseInk(content);
      const result = addDivert(content, parsed.knots[0], 'target');

      expect(result).toContain('-> target');
    });

    it('should add divert before trailing blank lines', () => {
      const content = `=== start ===
Hello


=== target ===
World`;
      const parsed = parseInk(content);
      const result = addDivert(content, parsed.knots[0], 'target');

      // Divert should come after content, not at the very end
      const helloIndex = result.indexOf('Hello');
      const divertIndex = result.indexOf('-> target');
      expect(divertIndex).toBeGreaterThan(helloIndex);
    });

    it('should handle END as target', () => {
      const content = `=== start ===
Hello`;
      const parsed = parseInk(content);
      const result = addDivert(content, parsed.knots[0], 'END');

      expect(result).toContain('-> END');
    });
  });

  describe('removeDivert', () => {
    it('should remove standalone divert', () => {
      const content = `=== start ===
Hello
-> target

=== target ===
World`;
      const parsed = parseInk(content);
      const result = removeDivert(content, parsed.knots[0], 'target');

      expect(result).toContain('Hello');
      expect(result).not.toMatch(/^.*-> target.*$/m);
      expect(result).toContain('=== target ===');
    });

    it('should only remove first occurrence', () => {
      const content = `=== start ===
-> target
-> target

=== target ===
World`;
      const parsed = parseInk(content);
      const result = removeDivert(content, parsed.knots[0], 'target');

      // Should still have one divert
      const matches = result.match(/-> target/g);
      expect(matches).toHaveLength(1);
    });

    it('should not remove choice diverts', () => {
      const content = `=== start ===
* Go there -> target

=== target ===
World`;
      const parsed = parseInk(content);
      const result = removeDivert(content, parsed.knots[0], 'target');

      // Choice divert should remain (it's not a standalone divert)
      expect(result).toContain('* Go there -> target');
    });
  });

  describe('updateDivert', () => {
    it('should update standalone divert target', () => {
      const content = `=== start ===
Hello
-> old_target

=== old_target ===
Old

=== new_target ===
New`;
      const parsed = parseInk(content);
      const result = updateDivert(content, parsed.knots[0], 'old_target', 'new_target');

      expect(result).toContain('-> new_target');
      expect(result).not.toContain('-> old_target');
    });

    it('should update choice divert target', () => {
      const content = `=== start ===
* Go there -> old_target

=== old_target ===
Old

=== new_target ===
New`;
      const parsed = parseInk(content);
      const result = updateDivert(content, parsed.knots[0], 'old_target', 'new_target');

      expect(result).toContain('* Go there -> new_target');
      expect(result).not.toContain('-> old_target');
    });

    it('should only update first matching divert', () => {
      const content = `=== start ===
-> target
-> target

=== target ===
World`;
      const parsed = parseInk(content);
      const result = updateDivert(content, parsed.knots[0], 'target', 'other');

      // First should be updated, second should remain
      expect(result).toContain('-> other');
      expect(result).toContain('-> target');
    });

    it('should handle END target', () => {
      const content = `=== start ===
Hello
-> END`;
      const parsed = parseInk(content);
      const result = updateDivert(content, parsed.knots[0], 'END', 'other_knot');

      expect(result).toContain('-> other_knot');
      expect(result).not.toContain('-> END');
    });

    it('should handle updating to END', () => {
      const content = `=== start ===
Hello
-> other_knot

=== other_knot ===
Content`;
      const parsed = parseInk(content);
      const result = updateDivert(content, parsed.knots[0], 'other_knot', 'END');

      expect(result).toContain('-> END');
      expect(result).not.toContain('-> other_knot');
    });

    it('should preserve surrounding content', () => {
      const content = `=== start ===
Before text
-> target
After text

=== target ===
World`;
      const parsed = parseInk(content);
      const result = updateDivert(content, parsed.knots[0], 'target', 'new_target');

      expect(result).toContain('Before text');
      expect(result).toContain('After text');
      expect(result).toContain('-> new_target');
    });

    it('should update indented divert in multi-line choice', () => {
      const content = `=== start ===
Hey, I need to tell you something...
+ [What is it?]
    -> reveal
+ [Not now]
    -> END

=== reveal ===
Secret`;
      const parsed = parseInk(content);
      const result = updateDivert(content, parsed.knots[0], 'reveal', 'other_knot');

      expect(result).toContain('-> other_knot');
      expect(result).not.toContain('-> reveal');
      expect(result).toContain('+ [What is it?]');
      expect(result).toContain('-> END');
    });

    it('should not update diverts in other knots', () => {
      const content = `=== start ===
-> target

=== middle ===
-> target

=== target ===
End`;
      const parsed = parseInk(content);
      // Only update the first knot
      const result = updateDivert(content, parsed.knots[0], 'target', 'new_target');

      expect(result).toContain('=== start ===');
      expect(result).toContain('-> new_target');
      // The divert in 'middle' should remain unchanged
      expect(result).toMatch(/=== middle ===[\s\S]*-> target/);
    });
  });

  describe('renameKnot', () => {
    it('should rename knot header', () => {
      const content = `=== old_name ===
Content`;
      const result = renameKnot(content, 'old_name', 'new_name');

      expect(result).toContain('=== new_name ===');
      expect(result).not.toContain('old_name');
    });

    it('should update diverts to renamed knot', () => {
      const content = `=== start ===
-> old_name

=== old_name ===
Content`;
      const result = renameKnot(content, 'old_name', 'new_name');

      expect(result).toContain('-> new_name');
      expect(result).not.toContain('-> old_name');
    });

    it('should update choice diverts', () => {
      const content = `=== start ===
* Go -> old_name

=== old_name ===
Content`;
      const result = renameKnot(content, 'old_name', 'new_name');

      expect(result).toContain('-> new_name');
    });

    it('should handle multiple references', () => {
      const content = `=== start ===
* Option A -> target
* Option B -> target
-> target

=== target ===
End`;
      const result = renameKnot(content, 'target', 'destination');

      expect(result).not.toContain('target');
      expect((result.match(/destination/g) || []).length).toBe(4);
    });

    it('should handle knot with == syntax', () => {
      const content = `== old_name
Content`;
      const result = renameKnot(content, 'old_name', 'new_name');

      expect(result).toContain('new_name');
    });
  });

  describe('renameRegion', () => {
    it('should rename region in StartRegion comment', () => {
      const content = `// <# StartRegion: Old Name #>

=== knot ===
Content

// <# EndRegion #>`;
      const result = renameRegion(content, 'Old Name', 'New Name');

      expect(result).toContain('// <# StartRegion: New Name #>');
      expect(result).not.toContain('Old Name');
    });

    it('should handle region names with special characters', () => {
      const content = `// <# StartRegion: My Region #>
// <# EndRegion #>`;
      const result = renameRegion(content, 'My Region', 'Another Region');

      expect(result).toContain('// <# StartRegion: Another Region #>');
    });

    it('should not affect EndRegion comment', () => {
      const content = `// <# StartRegion: Test #>
// <# EndRegion #>`;
      const result = renameRegion(content, 'Test', 'NewTest');

      expect(result).toContain('// <# EndRegion #>');
    });

    it('should rename only the matching region', () => {
      const content = `// <# StartRegion: Region A #>
// <# EndRegion #>

// <# StartRegion: Region B #>
// <# EndRegion #>`;
      const result = renameRegion(content, 'Region A', 'Region C');

      expect(result).toContain('// <# StartRegion: Region C #>');
      expect(result).toContain('// <# StartRegion: Region B #>');
      expect(result).not.toContain('Region A');
    });
  });

  describe('generateInk', () => {
    it('should generate clean ink from parsed content', () => {
      const content = `=== start ===
Hello
-> END`;
      const parsed = parseInk(content);
      const result = generateInk(parsed);

      expect(result).toContain('=== start ===');
      expect(result).toContain('Hello');
      expect(result).toContain('-> END');
    });

    it('should include externals', () => {
      const content = `EXTERNAL Test(param)

=== start ===
Hello`;
      const parsed = parseInk(content);
      const result = generateInk(parsed);

      expect(result).toContain('EXTERNAL Test(param)');
    });

    it('should include initial divert', () => {
      const content = `-> start

=== start ===
Hello`;
      const parsed = parseInk(content);
      const result = generateInk(parsed);

      expect(result).toContain('-> start');
    });

    it('should include position comments', () => {
      const content = `=== start ===
// <{ "pos-x": 100.0, "pos-y": 200.0 }>
Hello`;
      const parsed = parseInk(content);
      const result = generateInk(parsed);

      expect(result).toContain('pos-x');
    });

    it('should end with newline', () => {
      const content = `=== start ===
Hello`;
      const parsed = parseInk(content);
      const result = generateInk(parsed);

      expect(result.endsWith('\n')).toBe(true);
    });
  });

  describe('updateKnotPositions', () => {
    it('should update multiple knot positions', () => {
      const content = `=== first ===
Content 1

=== second ===
Content 2`;
      const parsed = parseInk(content);
      const positions = new Map([
        ['first', { x: 100, y: 100 }],
        ['second', { x: 200, y: 200 }],
      ]);

      const result = updateKnotPositions(content, positions, parsed.knots);

      expect(result).toContain('// <{ "pos-x": 100.0, "pos-y": 100.0 }>');
      expect(result).toContain('// <{ "pos-x": 200.0, "pos-y": 200.0 }>');
    });

    it('should handle partial position updates', () => {
      const content = `=== first ===
Content 1

=== second ===
Content 2`;
      const parsed = parseInk(content);
      const positions = new Map([
        ['first', { x: 100, y: 100 }],
      ]);

      const result = updateKnotPositions(content, positions, parsed.knots);

      expect(result).toContain('// <{ "pos-x": 100.0, "pos-y": 100.0 }>');
      // Second knot should not have position
      const secondIndex = result.indexOf('=== second ===');
      const afterSecond = result.substring(secondIndex, secondIndex + 100);
      expect(afterSecond).not.toContain('pos-x');
    });
  });

  describe('moveKnotToRegion', () => {
    it('should move a knot into a region', () => {
      const content = `// <# StartRegion: Target Region #>

=== existing ===
In region
-> END

// <# EndRegion #>

=== outside ===
Outside
-> END`;
      const parsed = parseInk(content);
      const outsideKnot = parsed.knots.find(k => k.name === 'outside')!;
      const targetRegion = parsed.regions[0];

      const result = moveKnotToRegion(content, outsideKnot, targetRegion, parsed.regions);

      // The knot should now appear before EndRegion
      expect(result).toContain('=== outside ===');
      const outsideIndex = result.indexOf('=== outside ===');
      const endRegionIndex = result.indexOf('// <# EndRegion #>');
      expect(outsideIndex).toBeLessThan(endRegionIndex);
    });

    it('should move a knot out of a region', () => {
      const content = `// <# StartRegion: Source Region #>

=== inside ===
In region
-> END

// <# EndRegion #>`;
      const parsed = parseInk(content);
      const insideKnot = parsed.knots.find(k => k.name === 'inside')!;

      const result = moveKnotToRegion(content, insideKnot, null, parsed.regions);

      // The knot should now appear after EndRegion (at end of file)
      const insideIndex = result.indexOf('=== inside ===');
      const endRegionIndex = result.indexOf('// <# EndRegion #>');
      expect(insideIndex).toBeGreaterThan(endRegionIndex);
    });

    it('should preserve knot content when moving', () => {
      const content = `// <# StartRegion: Target #>

=== target_knot ===
Target content
-> END

// <# EndRegion #>

=== source_knot ===
// <{ "pos-x": 100.0, "pos-y": 200.0 }>
Source content with position
* Choice -> END`;
      const parsed = parseInk(content);
      const sourceKnot = parsed.knots.find(k => k.name === 'source_knot')!;
      const targetRegion = parsed.regions[0];

      const result = moveKnotToRegion(content, sourceKnot, targetRegion, parsed.regions);

      expect(result).toContain('=== source_knot ===');
      expect(result).toContain('Source content with position');
      expect(result).toContain('* Choice -> END');
      expect(result).toContain('pos-x');
    });

    it('should move a knot between regions', () => {
      const content = `// <# StartRegion: Region A #>

=== knot_a ===
In A
-> END

// <# EndRegion #>

// <# StartRegion: Region B #>

=== knot_b ===
In B
-> END

// <# EndRegion #>`;
      const parsed = parseInk(content);
      const knotA = parsed.knots.find(k => k.name === 'knot_a')!;
      const regionB = parsed.regions.find(r => r.name === 'Region B')!;

      const result = moveKnotToRegion(content, knotA, regionB, parsed.regions);

      // knot_a should now be in Region B (before its EndRegion)
      const knotAIndex = result.indexOf('=== knot_a ===');
      const regionBStart = result.indexOf('// <# StartRegion: Region B #>');
      const regionBEnd = result.lastIndexOf('// <# EndRegion #>');

      expect(knotAIndex).toBeGreaterThan(regionBStart);
      expect(knotAIndex).toBeLessThan(regionBEnd);
    });

    it('should handle moving the only knot in a region', () => {
      const content = `// <# StartRegion: Only Region #>

=== only_knot ===
Content
-> END

// <# EndRegion #>`;
      const parsed = parseInk(content);
      const onlyKnot = parsed.knots[0];

      const result = moveKnotToRegion(content, onlyKnot, null, parsed.regions);

      // Region should still exist but be empty
      expect(result).toContain('// <# StartRegion: Only Region #>');
      expect(result).toContain('// <# EndRegion #>');
      // Knot should be after the region
      const knotIndex = result.indexOf('=== only_knot ===');
      const endRegionIndex = result.indexOf('// <# EndRegion #>');
      expect(knotIndex).toBeGreaterThan(endRegionIndex);
    });
  });

  describe('addRegion', () => {
    it('should add a new empty region to the file', () => {
      const content = `=== start ===
Hello
-> END`;
      const result = addRegion(content, 'New Region');

      expect(result).toContain('// <# StartRegion: New Region #>');
      expect(result).toContain('// <# EndRegion #>');
    });

    it('should add region with position', () => {
      const content = `=== start ===
Hello
-> END`;
      const result = addRegion(content, 'Positioned Region', { x: 500, y: 200 });

      expect(result).toContain('// <# StartRegion: Positioned Region #>');
      expect(result).toContain('// <{ "pos-x": 500.0, "pos-y": 200.0 }>');
      expect(result).toContain('// <# EndRegion #>');
    });

    it('should add region at end of file', () => {
      const content = `=== start ===
Hello
-> END`;
      const result = addRegion(content, 'End Region');

      // Region should appear after the existing content
      const startIndex = result.indexOf('=== start ===');
      const regionIndex = result.indexOf('// <# StartRegion: End Region #>');
      expect(regionIndex).toBeGreaterThan(startIndex);
    });
  });

  describe('deleteRegion', () => {
    it('should remove region markers but keep knots inside', () => {
      const content = `// <# StartRegion: Test Region #>

=== inside_knot ===
Content
-> END

// <# EndRegion #>`;
      const result = deleteRegion(content, 'Test Region');

      // Region markers should be gone
      expect(result).not.toContain('// <# StartRegion: Test Region #>');
      expect(result).not.toContain('// <# EndRegion #>');
      // But knot should remain
      expect(result).toContain('=== inside_knot ===');
      expect(result).toContain('Content');
    });

    it('should remove region with position comment', () => {
      const content = `// <# StartRegion: Positioned #>
// <{ "pos-x": 100.0, "pos-y": 200.0 }>

=== knot ===
Hello
-> END

// <# EndRegion #>`;
      const result = deleteRegion(content, 'Positioned');

      expect(result).not.toContain('StartRegion');
      expect(result).not.toContain('EndRegion');
      expect(result).not.toContain('pos-x');
      expect(result).toContain('=== knot ===');
    });

    it('should handle multiple regions and only delete the target', () => {
      const content = `// <# StartRegion: Keep This #>

=== keep ===
Keep
-> END

// <# EndRegion #>

// <# StartRegion: Delete This #>

=== remove_region ===
Remove
-> END

// <# EndRegion #>`;
      const result = deleteRegion(content, 'Delete This');

      // First region should remain
      expect(result).toContain('// <# StartRegion: Keep This #>');
      expect(result).toContain('=== keep ===');
      // Second region markers should be gone, but knot remains
      expect(result).not.toContain('Delete This');
      expect(result).toContain('=== remove_region ===');
    });
  });
});
