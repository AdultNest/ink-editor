/**
 * Unit tests for useInkEditor edge and label generation
 *
 * These tests verify the graph generation logic without requiring React rendering
 */

import { describe, it, expect } from 'vitest';
import { parseInk } from '../parser';
import type { ParsedInk } from '../parser/inkTypes';
import type { Edge } from '@xyflow/react';

/**
 * Simplified version of the edge generation logic from useInkEditor
 * This allows us to test the logic in isolation
 *
 * Note: This now matches the actual implementation which does NOT deduplicate edges.
 * Each divert gets its own edge with a unique handle ID.
 */
function generateEdges(parsedInk: ParsedInk): Edge[] {
  const edges: Edge[] = [];
  const { knots } = parsedInk;
  const knotNames = new Set(knots.map(k => k.name));

  for (const knot of knots) {
    // No deduplication - each divert gets its own edge
    for (const divert of knot.diverts) {
      const targetId = divert.target === 'END' ? '__end__' : divert.target;

      // Unique handle ID format: "line:{lineNumber}:{target}"
      const sourceHandle = `line:${divert.lineNumber}:${divert.target}`;

      // Determine edge label: use choice text if available, otherwise target name
      let edgeLabel: string;
      if (divert.context === 'choice' && divert.choiceText) {
        const text = divert.choiceText;
        edgeLabel = text.length > 30 ? text.substring(0, 27) + '...' : text;
      } else {
        edgeLabel = divert.target;
      }

      if (divert.target === 'END' || knotNames.has(divert.target)) {
        edges.push({
          // Unique edge ID includes line number
          id: `${knot.name}:${divert.lineNumber}->${divert.target}`,
          source: knot.name,
          sourceHandle,
          target: targetId,
          targetHandle: 'input',
          type: 'smoothstep',
          label: edgeLabel,
        });
      }
    }
  }

  return edges;
}

describe('useInkEditor edge generation', () => {
  describe('edge labels', () => {
    it('should use choice text as edge label for inline choice diverts', () => {
      const content = `=== start ===
* Go there -> destination

=== destination ===
Arrived`;
      const parsed = parseInk(content);
      const edges = generateEdges(parsed);

      expect(edges).toHaveLength(1);
      expect(edges[0].label).toBe('Go there');
    });

    it('should use choice text as edge label for multi-line choice diverts', () => {
      const content = `=== start ===
Hey, I need to tell you something...
+ [What is it?]
    -> reveal
+ [Not now]
    -> END

=== reveal ===
It was a secret`;
      const parsed = parseInk(content);
      const edges = generateEdges(parsed);

      expect(edges).toHaveLength(2);

      const revealEdge = edges.find(e => e.target === 'reveal');
      expect(revealEdge).toBeDefined();
      expect(revealEdge?.label).toBe('What is it?');

      const endEdge = edges.find(e => e.target === '__end__');
      expect(endEdge).toBeDefined();
      expect(endEdge?.label).toBe('Not now');
    });

    it('should use target name as label for standalone diverts', () => {
      const content = `=== start ===
Some content
-> next

=== next ===
More content`;
      const parsed = parseInk(content);
      const edges = generateEdges(parsed);

      expect(edges).toHaveLength(1);
      expect(edges[0].label).toBe('next');
    });

    it('should truncate long choice text labels', () => {
      const content = `=== start ===
* This is a very long choice text that exceeds the maximum length -> destination

=== destination ===
Arrived`;
      const parsed = parseInk(content);
      const edges = generateEdges(parsed);

      expect(edges).toHaveLength(1);
      expect(edges[0].label).toBe('This is a very long choice ...');
      expect((edges[0].label as string).length).toBeLessThanOrEqual(30);
    });

    it('should handle mixed choice and standalone diverts', () => {
      const content = `=== start ===
* Option A -> path_a
* Option B -> path_b
-> fallback

=== path_a ===
A

=== path_b ===
B

=== fallback ===
Default`;
      const parsed = parseInk(content);
      const edges = generateEdges(parsed);

      expect(edges).toHaveLength(3);

      const pathAEdge = edges.find(e => e.target === 'path_a');
      expect(pathAEdge?.label).toBe('Option A');

      const pathBEdge = edges.find(e => e.target === 'path_b');
      expect(pathBEdge?.label).toBe('Option B');

      const fallbackEdge = edges.find(e => e.target === 'fallback');
      expect(fallbackEdge?.label).toBe('fallback');
    });

    it('should handle the sarah-chat-1 example correctly', () => {
      const content = `=== start ===
Hey! How's it going?
+ [Pretty good, you?]
    -> good_response
+ [Could be better...]
    -> bad_response

=== good_response ===
That's great to hear! I was thinking we could hang out later.
+ [Sounds fun!]
    -> END
+ [Maybe another time]
    -> END

=== bad_response ===
Oh no, what's wrong? Want to talk about it?
+ [It's nothing really]
    -> END
+ [Yeah, actually...]
    -> END`;
      const parsed = parseInk(content);
      const edges = generateEdges(parsed);

      // No deduplication - each divert gets its own edge:
      // start -> good_response with "Pretty good, you?"
      // start -> bad_response with "Could be better..."
      // good_response -> END with "Sounds fun!"
      // good_response -> END with "Maybe another time"
      // bad_response -> END with "It's nothing really"
      // bad_response -> END with "Yeah, actually..."

      // Check start knot edges
      const startEdges = edges.filter(e => e.source === 'start');
      expect(startEdges).toHaveLength(2);
      expect(startEdges.find(e => e.target === 'good_response')?.label).toBe('Pretty good, you?');
      expect(startEdges.find(e => e.target === 'bad_response')?.label).toBe('Could be better...');

      // Check good_response knot edges (NO deduplication - both edges to END)
      const goodResponseEdges = edges.filter(e => e.source === 'good_response');
      expect(goodResponseEdges).toHaveLength(2);
      expect(goodResponseEdges[0].target).toBe('__end__');
      expect(goodResponseEdges[1].target).toBe('__end__');
      // Check that we have both labels
      const goodLabels = goodResponseEdges.map(e => e.label);
      expect(goodLabels).toContain('Sounds fun!');
      expect(goodLabels).toContain('Maybe another time');

      // Check bad_response knot edges (NO deduplication - both edges to END)
      const badResponseEdges = edges.filter(e => e.source === 'bad_response');
      expect(badResponseEdges).toHaveLength(2);
      const badLabels = badResponseEdges.map(e => e.label);
      expect(badLabels).toContain("It's nothing really");
      expect(badLabels).toContain('Yeah, actually...');
    });
  });

  describe('unique edge handles', () => {
    it('should create separate edges for diverts to the same target', () => {
      const content = `=== start ===
* First option -> same_target
* Second option -> same_target

=== same_target ===
Both lead here`;
      const parsed = parseInk(content);
      const edges = generateEdges(parsed);

      // Each divert gets its own edge - no deduplication
      expect(edges).toHaveLength(2);

      // Check that both edges have different labels
      const labels = edges.map(e => e.label);
      expect(labels).toContain('First option');
      expect(labels).toContain('Second option');

      // Check that both edges have different sourceHandle IDs
      const handles = edges.map(e => e.sourceHandle);
      expect(handles[0]).not.toBe(handles[1]);
    });

    it('should use line numbers in handle IDs', () => {
      const content = `=== start ===
* First -> target
* Second -> target

=== target ===
End`;
      const parsed = parseInk(content);
      const edges = generateEdges(parsed);

      expect(edges).toHaveLength(2);

      // Handle IDs should include line numbers
      for (const edge of edges) {
        expect(edge.sourceHandle).toMatch(/^line:\d+:target$/);
      }

      // Different line numbers should result in different handles
      expect(edges[0].sourceHandle).not.toBe(edges[1].sourceHandle);
    });
  });
});
