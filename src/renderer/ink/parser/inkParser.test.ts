/**
 * Unit tests for the ink parser
 *
 * Tests based on the official ink language specification:
 * https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md
 */

import { describe, it, expect } from 'vitest';
import { parseInk, getKnotPreview, knotHasErrors } from './inkParser';

describe('inkParser', () => {
  describe('parseInk - Basic Structure', () => {
    it('should parse an empty file', () => {
      const result = parseInk('');
      expect(result.knots).toHaveLength(0);
      expect(result.externals).toHaveLength(0);
      expect(result.initialDivert).toBeUndefined();
      expect(result.errors).toHaveLength(0);
    });

    it('should parse content without any knots', () => {
      const content = `Hello world
This is some content`;
      const result = parseInk(content);
      expect(result.knots).toHaveLength(0);
    });
  });

  describe('parseInk - Knot Parsing', () => {
    it('should parse a single knot with === syntax', () => {
      const content = `=== start ===
Hello world`;
      const result = parseInk(content);

      expect(result.knots).toHaveLength(1);
      expect(result.knots[0].name).toBe('start');
      expect(result.knots[0].lineStart).toBe(1);
      expect(result.knots[0].bodyContent).toContain('Hello world');
    });

    it('should parse a knot with == syntax (no trailing equals)', () => {
      const content = `== start
Hello world`;
      const result = parseInk(content);

      expect(result.knots).toHaveLength(1);
      expect(result.knots[0].name).toBe('start');
    });

    it('should parse a knot with === syntax (no trailing equals)', () => {
      const content = `=== start
Hello world`;
      const result = parseInk(content);

      expect(result.knots).toHaveLength(1);
      expect(result.knots[0].name).toBe('start');
    });

    it('should parse multiple knots', () => {
      const content = `=== start ===
Hello world
-> next

=== next ===
Goodbye world
-> END`;
      const result = parseInk(content);

      expect(result.knots).toHaveLength(2);
      expect(result.knots[0].name).toBe('start');
      expect(result.knots[1].name).toBe('next');
    });

    it('should correctly identify knot line boundaries', () => {
      const content = `=== first ===
Line 1
Line 2

=== second ===
Line 3`;
      const result = parseInk(content);

      expect(result.knots[0].lineStart).toBe(1);
      expect(result.knots[0].lineEnd).toBe(4);
      expect(result.knots[1].lineStart).toBe(5);
      expect(result.knots[1].lineEnd).toBe(6);
    });

    it('should handle knot names with underscores', () => {
      const content = `=== my_knot_name ===
Content`;
      const result = parseInk(content);

      expect(result.knots[0].name).toBe('my_knot_name');
    });

    it('should handle knot names with numbers', () => {
      const content = `=== chapter1 ===
Content`;
      const result = parseInk(content);

      expect(result.knots[0].name).toBe('chapter1');
    });
  });

  describe('parseInk - Choice Parsing', () => {
    it('should parse basic choices with *', () => {
      const content = `=== start ===
What do you want?
* Option A
* Option B`;
      const result = parseInk(content);

      expect(result.knots[0].choices).toHaveLength(2);
      expect(result.knots[0].choices[0].text).toBe('Option A');
      expect(result.knots[0].choices[0].isSticky).toBe(false);
      expect(result.knots[0].choices[1].text).toBe('Option B');
    });

    it('should parse sticky choices with +', () => {
      const content = `=== start ===
What do you want?
+ Repeatable option`;
      const result = parseInk(content);

      expect(result.knots[0].choices).toHaveLength(1);
      expect(result.knots[0].choices[0].text).toBe('Repeatable option');
      expect(result.knots[0].choices[0].isSticky).toBe(true);
    });

    it('should parse choices with bracketed text only', () => {
      // When choice is ONLY bracketed text, the brackets are parsed
      const content = `=== start ===
* [Choose this]`;
      const result = parseInk(content);

      expect(result.knots[0].choices[0].text).toBe('Choose this');
    });

    it('should parse choices with bracketed and following text', () => {
      // When choice has text after brackets, full content is captured
      // This matches ink's "suppression" syntax: [shown] hidden
      const content = `=== start ===
* [Choose this] You chose this option`;
      const result = parseInk(content);

      // Current parser captures full text - enhancement would separate these
      expect(result.knots[0].choices[0].text).toContain('Choose this');
      expect(result.knots[0].choices).toHaveLength(1);
    });

    it('should parse choices with inline divert', () => {
      const content = `=== start ===
* Go to next -> next

=== next ===
You went to next`;
      const result = parseInk(content);

      expect(result.knots[0].choices[0].divert).toBe('next');
    });

    it('should parse choices with divert to END', () => {
      const content = `=== start ===
* End the story -> END`;
      const result = parseInk(content);

      expect(result.knots[0].choices[0].divert).toBe('END');
    });

    it('should track choice line numbers', () => {
      const content = `=== start ===
Line one
* Choice on line 3`;
      const result = parseInk(content);

      expect(result.knots[0].choices[0].lineNumber).toBe(3);
    });
  });

  describe('parseInk - Divert Parsing', () => {
    it('should parse standalone diverts', () => {
      const content = `=== start ===
Hello
-> next

=== next ===
World`;
      const result = parseInk(content);

      expect(result.knots[0].diverts).toHaveLength(1);
      expect(result.knots[0].diverts[0].target).toBe('next');
      expect(result.knots[0].diverts[0].context).toBe('standalone');
    });

    it('should parse choice diverts', () => {
      const content = `=== start ===
* Go there -> destination

=== destination ===
Arrived`;
      const result = parseInk(content);

      expect(result.knots[0].diverts).toHaveLength(1);
      expect(result.knots[0].diverts[0].target).toBe('destination');
      expect(result.knots[0].diverts[0].context).toBe('choice');
      expect(result.knots[0].diverts[0].choiceText).toBe('Go there');
    });

    it('should parse divert to END', () => {
      const content = `=== start ===
The end
-> END`;
      const result = parseInk(content);

      expect(result.knots[0].diverts).toHaveLength(1);
      expect(result.knots[0].diverts[0].target).toBe('END');
    });

    it('should collect multiple diverts from one knot', () => {
      const content = `=== start ===
* Option A -> path_a
* Option B -> path_b
-> default

=== path_a ===
A

=== path_b ===
B

=== default ===
Default`;
      const result = parseInk(content);

      expect(result.knots[0].diverts).toHaveLength(3);
      const targets = result.knots[0].diverts.map(d => d.target);
      expect(targets).toContain('path_a');
      expect(targets).toContain('path_b');
      expect(targets).toContain('default');
    });

    it('should deduplicate diverts to same target', () => {
      const content = `=== start ===
* First way -> destination
* Second way -> destination

=== destination ===
Arrived`;
      const result = parseInk(content);

      // Both diverts should be tracked (same target, different lines)
      expect(result.knots[0].diverts).toHaveLength(2);
    });

    it('should associate multi-line choice diverts with the choice', () => {
      const content = `=== start ===
Hey, I need to tell you something...
+ [What is it?]
    -> reveal
+ [Not now]
    -> END

=== reveal ===
It was a secret`;
      const result = parseInk(content);

      expect(result.knots[0].diverts).toHaveLength(2);

      const revealDivert = result.knots[0].diverts.find(d => d.target === 'reveal');
      expect(revealDivert).toBeDefined();
      expect(revealDivert?.context).toBe('choice');
      expect(revealDivert?.choiceText).toBe('What is it?');

      const endDivert = result.knots[0].diverts.find(d => d.target === 'END');
      expect(endDivert).toBeDefined();
      expect(endDivert?.context).toBe('choice');
      expect(endDivert?.choiceText).toBe('Not now');
    });

    it('should handle nested content after choice before divert', () => {
      const content = `=== start ===
* [Ask about weather]
    It's sunny today.
    -> weather_chat
* [Leave]
    -> END

=== weather_chat ===
Talking about weather`;
      const result = parseInk(content);

      expect(result.knots[0].diverts).toHaveLength(2);

      const weatherDivert = result.knots[0].diverts.find(d => d.target === 'weather_chat');
      expect(weatherDivert?.context).toBe('choice');
      expect(weatherDivert?.choiceText).toBe('Ask about weather');
    });

    it('should reset choice context after standalone divert', () => {
      const content = `=== start ===
* [First choice]
    -> path_a
-> fallback
Some other text
-> END

=== path_a ===
Path A

=== fallback ===
Fallback`;
      const result = parseInk(content);

      const fallbackDivert = result.knots[0].diverts.find(d => d.target === 'fallback');
      expect(fallbackDivert?.context).toBe('standalone');
      expect(fallbackDivert?.choiceText).toBeUndefined();

      const endDivert = result.knots[0].diverts.find(d => d.target === 'END');
      expect(endDivert?.context).toBe('standalone');
    });
  });

  describe('parseInk - Initial Divert', () => {
    it('should parse initial divert before first knot', () => {
      const content = `-> start

=== start ===
Hello`;
      const result = parseInk(content);

      expect(result.initialDivert).toBe('start');
    });

    it('should handle missing initial divert', () => {
      const content = `=== start ===
Hello`;
      const result = parseInk(content);

      expect(result.initialDivert).toBeUndefined();
    });
  });

  describe('parseInk - EXTERNAL Declarations', () => {
    it('should parse EXTERNAL with no params', () => {
      const content = `EXTERNAL DoSomething()

=== start ===
Hello`;
      const result = parseInk(content);

      expect(result.externals).toHaveLength(1);
      expect(result.externals[0].name).toBe('DoSomething');
      expect(result.externals[0].params).toHaveLength(0);
    });

    it('should parse EXTERNAL with one param', () => {
      const content = `EXTERNAL SetFlag(flagName)

=== start ===
Hello`;
      const result = parseInk(content);

      expect(result.externals).toHaveLength(1);
      expect(result.externals[0].name).toBe('SetFlag');
      expect(result.externals[0].params).toEqual(['flagName']);
    });

    it('should parse EXTERNAL with multiple params', () => {
      const content = `EXTERNAL ShowTransition(title, subtitle, duration)

=== start ===
Hello`;
      const result = parseInk(content);

      expect(result.externals).toHaveLength(1);
      expect(result.externals[0].name).toBe('ShowTransition');
      expect(result.externals[0].params).toEqual(['title', 'subtitle', 'duration']);
    });

    it('should parse multiple EXTERNAL declarations', () => {
      const content = `EXTERNAL GetFlag(name)
EXTERNAL SetFlag(name)
EXTERNAL RemoveFlag(name)

=== start ===
Hello`;
      const result = parseInk(content);

      expect(result.externals).toHaveLength(3);
      expect(result.externals[0].name).toBe('GetFlag');
      expect(result.externals[1].name).toBe('SetFlag');
      expect(result.externals[2].name).toBe('RemoveFlag');
    });

    it('should track EXTERNAL line numbers', () => {
      const content = `EXTERNAL First()
EXTERNAL Second()

=== start ===
Hello`;
      const result = parseInk(content);

      expect(result.externals[0].lineNumber).toBe(1);
      expect(result.externals[1].lineNumber).toBe(2);
    });
  });

  describe('parseInk - Comments', () => {
    it('should ignore single-line comments', () => {
      const content = `=== start ===
// This is a comment
Hello world`;
      const result = parseInk(content);

      expect(result.knots[0].bodyContent).toContain('Hello world');
      // Comments should be preserved in raw content but stripped for parsing
    });

    it('should handle comments at end of line', () => {
      const content = `=== start ===
Hello // inline comment`;
      const result = parseInk(content);

      expect(result.knots).toHaveLength(1);
    });

    it('should handle multi-line comments', () => {
      const content = `=== start ===
/* This is a
multi-line
comment */
Hello`;
      const result = parseInk(content);

      expect(result.knots).toHaveLength(1);
      expect(result.knots[0].name).toBe('start');
    });
  });

  describe('parseInk - Position Comments', () => {
    it('should parse position comment', () => {
      const content = `=== start ===
// <{ "pos-x": 100.5, "pos-y": 200.0 }>
Hello world`;
      const result = parseInk(content);

      expect(result.knots[0].position).toBeDefined();
      expect(result.knots[0].position?.x).toBe(100.5);
      expect(result.knots[0].position?.y).toBe(200);
    });

    it('should handle negative positions', () => {
      const content = `=== start ===
// <{ "pos-x": -50.0, "pos-y": -100.0 }>
Hello world`;
      const result = parseInk(content);

      expect(result.knots[0].position?.x).toBe(-50);
      expect(result.knots[0].position?.y).toBe(-100);
    });

    it('should handle missing position', () => {
      const content = `=== start ===
Hello world`;
      const result = parseInk(content);

      expect(result.knots[0].position).toBeUndefined();
    });
  });

  describe('parseInk - Error Detection', () => {
    it('should detect undefined divert target', () => {
      const content = `=== start ===
-> undefined_knot`;
      const result = parseInk(content);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].severity).toBe('error');
      expect(result.errors[0].message).toContain('undefined_knot');
    });

    it('should detect undefined divert in choice', () => {
      const content = `=== start ===
* Go there -> nonexistent`;
      const result = parseInk(content);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('nonexistent');
    });

    it('should not error on divert to END', () => {
      const content = `=== start ===
-> END`;
      const result = parseInk(content);

      expect(result.errors).toHaveLength(0);
    });

    it('should detect duplicate knot names', () => {
      const content = `=== duplicate ===
First

=== duplicate ===
Second`;
      const result = parseInk(content);

      const duplicateErrors = result.errors.filter(e =>
        e.message.includes('Duplicate')
      );
      expect(duplicateErrors.length).toBeGreaterThan(0);
    });

    it('should warn about empty knots', () => {
      const content = `=== empty ===

=== next ===
Content`;
      const result = parseInk(content);

      const emptyWarnings = result.errors.filter(e =>
        e.severity === 'warning' && e.message.includes('empty')
      );
      expect(emptyWarnings.length).toBeGreaterThan(0);
    });

    it('should detect undefined initial divert', () => {
      const content = `-> nonexistent

=== start ===
Hello`;
      const result = parseInk(content);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('nonexistent');
    });
  });

  describe('parseInk - Real World Examples', () => {
    it('should parse the sarah-chat-1 example', () => {
      const content = `// Sarah's first chat conversation
=== start ===
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
      const result = parseInk(content);

      expect(result.knots).toHaveLength(3);
      expect(result.knots[0].name).toBe('start');
      expect(result.knots[1].name).toBe('good_response');
      expect(result.knots[2].name).toBe('bad_response');

      expect(result.knots[0].choices).toHaveLength(2);
      expect(result.knots[0].diverts).toHaveLength(2);

      expect(result.errors).toHaveLength(0);
    });

    it('should parse example with externals', () => {
      const content = `EXTERNAL GetStoryFlag(flagName)
EXTERNAL SetStoryFlag(flagName)
EXTERNAL ShowCustomTransition(title, subtitle)

-> start

== start
Hello!
-> END`;
      const result = parseInk(content);

      expect(result.externals).toHaveLength(3);
      expect(result.initialDivert).toBe('start');
      expect(result.knots).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse complex conversation with positions', () => {
      const content = `=== intro ===
// <{ "pos-x": 100.0, "pos-y": 50.0 }>
Welcome to the story!
* [Begin] -> chapter1
* [Skip intro] -> chapter2

=== chapter1 ===
// <{ "pos-x": 400.0, "pos-y": 50.0 }>
Chapter 1 content
-> chapter2

=== chapter2 ===
// <{ "pos-x": 400.0, "pos-y": 200.0 }>
Chapter 2 content
-> END`;
      const result = parseInk(content);

      expect(result.knots).toHaveLength(3);
      expect(result.knots[0].position?.x).toBe(100);
      expect(result.knots[1].position?.x).toBe(400);
      expect(result.knots[2].position?.y).toBe(200);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('getKnotPreview', () => {
    it('should return first text line as preview', () => {
      const content = `=== start ===
Hello world
More content`;
      const result = parseInk(content);
      const preview = getKnotPreview(result.knots[0]);

      expect(preview).toBe('Hello world');
    });

    it('should skip choice lines in preview', () => {
      const content = `=== start ===
* Choice
First real line`;
      const result = parseInk(content);
      const preview = getKnotPreview(result.knots[0]);

      expect(preview).toBe('First real line');
    });

    it('should skip divert lines in preview', () => {
      const content = `=== start ===
-> somewhere
First real line

=== somewhere ===
x`;
      const result = parseInk(content);
      const preview = getKnotPreview(result.knots[0]);

      expect(preview).toBe('First real line');
    });

    it('should truncate long previews', () => {
      const content = `=== start ===
This is a very long line that should be truncated because it exceeds fifty characters`;
      const result = parseInk(content);
      const preview = getKnotPreview(result.knots[0]);

      expect(preview.length).toBeLessThanOrEqual(50);
      expect(preview.endsWith('...')).toBe(true);
    });

    it('should return empty string for knots with only choices', () => {
      const content = `=== start ===
* Choice A -> a
* Choice B -> b

=== a ===
A

=== b ===
B`;
      const result = parseInk(content);
      const preview = getKnotPreview(result.knots[0]);

      expect(preview).toBe('');
    });
  });

  describe('knotHasErrors', () => {
    it('should return true if knot has errors', () => {
      const content = `=== start ===
-> undefined_target`;
      const result = parseInk(content);

      expect(knotHasErrors(result.knots[0], result)).toBe(true);
    });

    it('should return false if knot has no errors', () => {
      const content = `=== start ===
Hello
-> END`;
      const result = parseInk(content);

      expect(knotHasErrors(result.knots[0], result)).toBe(false);
    });

    it('should return false for warnings only', () => {
      const content = `=== empty ===

=== other ===
Content
-> END`;
      const result = parseInk(content);

      // Empty knot has warning, not error
      expect(knotHasErrors(result.knots[0], result)).toBe(false);
    });
  });

  describe('parseInk - Edge Cases', () => {
    it('should handle Windows line endings (CRLF)', () => {
      const content = "=== start ===\r\nHello\r\n-> END";
      const result = parseInk(content);

      expect(result.knots).toHaveLength(1);
      expect(result.knots[0].name).toBe('start');
    });

    it('should handle trailing whitespace', () => {
      const content = `=== start ===
Hello
-> END   `;
      const result = parseInk(content);

      expect(result.knots).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle multiple blank lines', () => {
      const content = `=== start ===


Hello


-> END`;
      const result = parseInk(content);

      expect(result.knots).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle knot with only position comment', () => {
      const content = `=== start ===
// <{ "pos-x": 100.0, "pos-y": 100.0 }>

=== next ===
Content`;
      const result = parseInk(content);

      // Knot with only position comment should be considered empty
      const emptyWarnings = result.errors.filter(e =>
        e.message.includes('empty') && e.message.includes('start')
      );
      expect(emptyWarnings.length).toBeGreaterThan(0);
    });

    it('should handle divert without space after arrow', () => {
      const content = `=== start ===
->next

=== next ===
Hello`;
      const result = parseInk(content);

      expect(result.knots[0].diverts).toHaveLength(1);
      expect(result.knots[0].diverts[0].target).toBe('next');
    });

    it('should handle choice without space after marker', () => {
      const content = `=== start ===
*Option without space -> END`;
      const result = parseInk(content);

      expect(result.knots[0].choices).toHaveLength(1);
    });

    it('should preserve raw content', () => {
      const content = `=== start ===
Hello world`;
      const result = parseInk(content);

      expect(result.rawContent).toBe(content);
    });
  });

  describe('parseInk - Inline Diverts', () => {
    it('should detect inline diverts in text', () => {
      const content = `=== start ===
You head to the market -> market_scene

=== market_scene ===
The market is busy.`;
      const result = parseInk(content);

      expect(result.knots[0].diverts).toHaveLength(1);
      expect(result.knots[0].diverts[0].context).toBe('inline');
    });
  });

  describe('parseInk - Region Parsing', () => {
    it('should parse a region with contained knots', () => {
      const content = `// <# StartRegion: Introduction #>

=== start ===
Hello!
-> next

=== next ===
World!
-> END

// <# EndRegion #>`;
      const result = parseInk(content);

      expect(result.regions).toHaveLength(1);
      expect(result.regions[0].name).toBe('Introduction');
      expect(result.regions[0].knotNames).toContain('start');
      expect(result.regions[0].knotNames).toContain('next');
      expect(result.regions[0].knotNames).toHaveLength(2);
    });

    it('should assign regionName to knots inside a region', () => {
      const content = `// <# StartRegion: MyRegion #>

=== knot_in_region ===
Content
-> END

// <# EndRegion #>

=== knot_outside ===
Other content
-> END`;
      const result = parseInk(content);

      const knotInRegion = result.knots.find(k => k.name === 'knot_in_region');
      const knotOutside = result.knots.find(k => k.name === 'knot_outside');

      expect(knotInRegion?.regionName).toBe('MyRegion');
      expect(knotOutside?.regionName).toBeUndefined();
    });

    it('should parse multiple regions', () => {
      const content = `// <# StartRegion: Region A #>

=== knot_a ===
A
-> END

// <# EndRegion #>

// <# StartRegion: Region B #>

=== knot_b ===
B
-> END

// <# EndRegion #>`;
      const result = parseInk(content);

      expect(result.regions).toHaveLength(2);
      expect(result.regions[0].name).toBe('Region A');
      expect(result.regions[0].knotNames).toContain('knot_a');
      expect(result.regions[1].name).toBe('Region B');
      expect(result.regions[1].knotNames).toContain('knot_b');
    });

    it('should parse region with position comment', () => {
      const content = `// <# StartRegion: Positioned Region #>
// <{ "pos-x": 100.5, "pos-y": 200.0 }>

=== start ===
Hello
-> END

// <# EndRegion #>`;
      const result = parseInk(content);

      expect(result.regions).toHaveLength(1);
      expect(result.regions[0].position).toBeDefined();
      expect(result.regions[0].position?.x).toBe(100.5);
      expect(result.regions[0].position?.y).toBe(200);
    });

    it('should track region line boundaries', () => {
      const content = `// <# StartRegion: Test #>

=== start ===
Hello

// <# EndRegion #>`;
      const result = parseInk(content);

      expect(result.regions[0].lineStart).toBe(1);
      expect(result.regions[0].lineEnd).toBe(6);
    });

    it('should handle region names with spaces', () => {
      const content = `// <# StartRegion: My Long Region Name #>

=== start ===
Hello
-> END

// <# EndRegion #>`;
      const result = parseInk(content);

      expect(result.regions[0].name).toBe('My Long Region Name');
    });

    it('should handle unclosed region at end of file', () => {
      const content = `// <# StartRegion: Unclosed #>

=== start ===
Hello
-> END`;
      const result = parseInk(content);

      expect(result.regions).toHaveLength(1);
      expect(result.regions[0].name).toBe('Unclosed');
      expect(result.regions[0].knotNames).toContain('start');
    });

    it('should handle empty regions', () => {
      const content = `// <# StartRegion: Empty #>
// <# EndRegion #>

=== outside ===
Hello
-> END`;
      const result = parseInk(content);

      expect(result.regions).toHaveLength(1);
      expect(result.regions[0].knotNames).toHaveLength(0);
    });

    it('should correctly set knot lineEnd when region ends', () => {
      const content = `// <# StartRegion: Test #>

=== knot_in_region ===
Content here
-> END

// <# EndRegion #>`;
      const result = parseInk(content);

      const knot = result.knots.find(k => k.name === 'knot_in_region');
      // lineEnd should be the line BEFORE the EndRegion (line 6)
      // EndRegion is on line 7
      expect(knot?.lineEnd).toBe(6);
    });

    it('should not include EndRegion in knot bodyContent', () => {
      const content = `// <# StartRegion: Test #>

=== knot_in_region ===
Content here
-> END

// <# EndRegion #>`;
      const result = parseInk(content);

      const knot = result.knots.find(k => k.name === 'knot_in_region');
      expect(knot?.bodyContent).not.toContain('EndRegion');
      expect(knot?.content).not.toContain('EndRegion');
    });

    it('should correctly set lineEnd for knots in different regions', () => {
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
      const result = parseInk(content);

      const knotA = result.knots.find(k => k.name === 'knot_a');
      const knotB = result.knots.find(k => k.name === 'knot_b');

      // knot_a should end before Region A's EndRegion (line 7)
      expect(knotA?.lineEnd).toBe(6);
      // knot_b should end before Region B's EndRegion (line 15)
      expect(knotB?.lineEnd).toBe(14);

      // Neither should include EndRegion in content
      expect(knotA?.bodyContent).not.toContain('EndRegion');
      expect(knotB?.bodyContent).not.toContain('EndRegion');
    });

    it('should handle knot followed by another knot in same region', () => {
      const content = `// <# StartRegion: Test #>

=== first ===
First content
-> second

=== second ===
Second content
-> END

// <# EndRegion #>`;
      const result = parseInk(content);

      const first = result.knots.find(k => k.name === 'first');
      const second = result.knots.find(k => k.name === 'second');

      // first knot should end before second knot starts
      expect(first?.lineEnd).toBe(6);
      expect(second?.lineStart).toBe(7);
      expect(second?.lineEnd).toBe(10);
    });

    it('should handle knot after region end', () => {
      const content = `// <# StartRegion: Test #>

=== inside ===
In region
-> outside

// <# EndRegion #>

=== outside ===
Outside region
-> END`;
      const result = parseInk(content);

      const inside = result.knots.find(k => k.name === 'inside');
      const outside = result.knots.find(k => k.name === 'outside');

      // inside knot should end before EndRegion
      expect(inside?.lineEnd).toBe(6);
      expect(inside?.regionName).toBe('Test');

      // outside knot should have no region
      expect(outside?.regionName).toBeUndefined();
      // Line 9 is where === outside === appears (1-indexed)
      expect(outside?.lineStart).toBe(9);
    });

    it('should handle empty knot followed by empty region at end of file', () => {
      const content = `=== empty_knot ===

// <# StartRegion: test #>
// <{ "pos-x": 400.0, "pos-y": 200.0 }>

// <# EndRegion #>`;
      const result = parseInk(content);

      const knot = result.knots.find(k => k.name === 'empty_knot');

      // The knot should end BEFORE the region starts (line 2)
      // Region starts on line 3
      expect(knot?.lineEnd).toBe(2);

      // The knot's body should NOT contain region markers
      expect(knot?.bodyContent).not.toContain('StartRegion');
      expect(knot?.bodyContent).not.toContain('EndRegion');
      expect(knot?.bodyContent).not.toContain('pos-x');

      // The region should be parsed correctly
      expect(result.regions).toHaveLength(1);
      expect(result.regions[0].name).toBe('test');
      expect(result.regions[0].position?.x).toBe(400.0);
      expect(result.regions[0].position?.y).toBe(200.0);
    });

    it('should handle knot with content followed by empty region', () => {
      const content = `=== my_knot ===
Hello world
-> END

// <# StartRegion: my_region #>
// <# EndRegion #>`;
      const result = parseInk(content);

      const knot = result.knots.find(k => k.name === 'my_knot');

      // The knot should end BEFORE the region starts (line 4)
      // Region starts on line 5
      expect(knot?.lineEnd).toBe(4);

      // The knot's body should NOT contain region markers
      expect(knot?.bodyContent).not.toContain('StartRegion');
      expect(knot?.bodyContent).not.toContain('EndRegion');
    });

    it('should handle knot followed by empty region followed by another knot', () => {
      const content = `=== test1 ===
// <{ "pos-x": 919.7, "pos-y": -783.0 }>

// <# StartRegion: testregion #>
// <{ "pos-x": 360.4, "pos-y": -787.9 }>

// <# EndRegion #>
-> test2

=== test2 ===
// <{ "pos-x": 1071.7, "pos-y": -515.5 }>
-> test1`;
      const result = parseInk(content);

      const test1 = result.knots.find(k => k.name === 'test1');
      const test2 = result.knots.find(k => k.name === 'test2');

      // test1 should end BEFORE the region starts (line 3)
      // Region starts on line 4
      expect(test1?.lineEnd).toBe(3);

      // test1's body should NOT contain region markers
      expect(test1?.bodyContent).not.toContain('StartRegion');
      expect(test1?.bodyContent).not.toContain('EndRegion');
      expect(test1?.bodyContent).not.toContain('testregion');

      // test1 should NOT have the divert -> test2 (that's after the region)
      expect(test1?.bodyContent).not.toContain('-> test2');

      // test2 should be parsed correctly
      expect(test2?.lineStart).toBe(10);
      expect(test2?.bodyContent).toContain('-> test1');

      // Region should be parsed correctly
      expect(result.regions).toHaveLength(1);
      expect(result.regions[0].name).toBe('testregion');
    });

    it('should not include content after region in previous knot', () => {
      const content = `=== before ===
Content before

// <# StartRegion: middle #>
// <# EndRegion #>

Orphaned content

=== after ===
Content after`;
      const result = parseInk(content);

      const before = result.knots.find(k => k.name === 'before');
      const after = result.knots.find(k => k.name === 'after');

      // "before" knot should end before the region
      expect(before?.lineEnd).toBe(3);
      expect(before?.bodyContent).not.toContain('StartRegion');
      expect(before?.bodyContent).not.toContain('Orphaned');

      // "after" knot should be normal
      expect(after?.bodyContent).toContain('Content after');
    });
  });

  describe('parseInk - Story Flags', () => {
    describe('SetStoryFlag parsing', () => {
      it('should parse a single SetStoryFlag', () => {
        const content = `=== start ===
~ SetStoryFlag("player_ready")
Hello!
-> END`;
        const result = parseInk(content);

        expect(result.knots[0].storyFlags).toHaveLength(1);
        expect(result.knots[0].storyFlags[0].name).toBe('player_ready');
        expect(result.knots[0].storyFlags[0].operation).toBe('set');
        expect(result.knots[0].storyFlags[0].lineNumber).toBe(2);
      });

      it('should parse multiple SetStoryFlags', () => {
        const content = `=== start ===
~ SetStoryFlag("flag_one")
~ SetStoryFlag("flag_two")
Hello!
-> END`;
        const result = parseInk(content);

        expect(result.knots[0].storyFlags).toHaveLength(2);
        expect(result.knots[0].storyFlags[0].name).toBe('flag_one');
        expect(result.knots[0].storyFlags[1].name).toBe('flag_two');
      });

      it('should handle SetStoryFlag with underscores in name', () => {
        const content = `=== start ===
~ SetStoryFlag("player_chose_honesty")
-> END`;
        const result = parseInk(content);

        expect(result.knots[0].storyFlags[0].name).toBe('player_chose_honesty');
      });
    });

    describe('RemoveStoryFlag parsing', () => {
      it('should parse a single RemoveStoryFlag', () => {
        const content = `=== start ===
~ RemoveStoryFlag("temporary_flag")
-> END`;
        const result = parseInk(content);

        expect(result.knots[0].storyFlags).toHaveLength(1);
        expect(result.knots[0].storyFlags[0].name).toBe('temporary_flag');
        expect(result.knots[0].storyFlags[0].operation).toBe('remove');
      });

      it('should parse SetStoryFlag and RemoveStoryFlag together', () => {
        const content = `=== start ===
~ SetStoryFlag("new_flag")
~ RemoveStoryFlag("old_flag")
-> END`;
        const result = parseInk(content);

        expect(result.knots[0].storyFlags).toHaveLength(2);
        const setFlag = result.knots[0].storyFlags.find(f => f.operation === 'set');
        const removeFlag = result.knots[0].storyFlags.find(f => f.operation === 'remove');
        expect(setFlag?.name).toBe('new_flag');
        expect(removeFlag?.name).toBe('old_flag');
      });
    });

    describe('GetStoryFlag conditional parsing', () => {
      it('should parse a simple conditional with GetStoryFlag', () => {
        const content = `=== start ===
{
    - GetStoryFlag("sarah_angry"):
        -> angry_sarah
    - else:
        -> neutral_sarah
}

=== angry_sarah ===
She's mad
-> END

=== neutral_sarah ===
She's calm
-> END`;
        const result = parseInk(content);

        expect(result.knots[0].conditionalBlocks).toHaveLength(1);
        expect(result.knots[0].conditionalBlocks[0].branches).toHaveLength(1);
        expect(result.knots[0].conditionalBlocks[0].branches[0].flagName).toBe('sarah_angry');
        expect(result.knots[0].conditionalBlocks[0].elseDivert).toBe('neutral_sarah');
      });

      it('should parse multiple GetStoryFlag branches', () => {
        const content = `=== start ===
{
    - GetStoryFlag("sarah_angry"):
        -> angry_sarah
    - GetStoryFlag("sarah_happy"):
        -> happy_sarah
    - else:
        -> neutral_sarah
}

=== angry_sarah ===
Angry
-> END

=== happy_sarah ===
Happy
-> END

=== neutral_sarah ===
Neutral
-> END`;
        const result = parseInk(content);

        expect(result.knots[0].conditionalBlocks[0].branches).toHaveLength(2);
        expect(result.knots[0].conditionalBlocks[0].branches[0].flagName).toBe('sarah_angry');
        expect(result.knots[0].conditionalBlocks[0].branches[1].flagName).toBe('sarah_happy');
      });

      it('should record flag checks in storyFlags array', () => {
        const content = `=== start ===
{
    - GetStoryFlag("checked_flag"):
        -> target
    - else:
        -> other
}

=== target ===
Target
-> END

=== other ===
Other
-> END`;
        const result = parseInk(content);

        const checkFlag = result.knots[0].storyFlags.find(f => f.operation === 'check');
        expect(checkFlag).toBeDefined();
        expect(checkFlag?.name).toBe('checked_flag');
        expect(checkFlag?.divertTarget).toBe('target');
      });

      it('should parse inline content with divert', () => {
        const content = `=== start ===
{
    - GetStoryFlag("has_key"): You use the key -> door_opens
    - else:
        -> door_locked
}

=== door_opens ===
Open
-> END

=== door_locked ===
Locked
-> END`;
        const result = parseInk(content);

        expect(result.knots[0].conditionalBlocks[0].branches[0].content).toBe('You use the key');
        expect(result.knots[0].conditionalBlocks[0].branches[0].divert).toBe('door_opens');
      });
    });

    describe('Conditional diverts separation', () => {
      it('should mark diverts from conditionals as conditional context', () => {
        const content = `=== start ===
{
    - GetStoryFlag("flag_a"):
        -> path_a
    - else:
        -> path_b
}

=== path_a ===
A
-> END

=== path_b ===
B
-> END`;
        const result = parseInk(content);

        const conditionalDiverts = result.knots[0].diverts.filter(d => d.context === 'conditional');
        expect(conditionalDiverts).toHaveLength(2);

        const flagDivert = conditionalDiverts.find(d => d.conditionFlag === 'flag_a');
        expect(flagDivert).toBeDefined();
        expect(flagDivert?.target).toBe('path_a');

        const elseDivert = conditionalDiverts.find(d => d.isElseBranch);
        expect(elseDivert).toBeDefined();
        expect(elseDivert?.target).toBe('path_b');
      });

      it('should keep regular diverts separate from conditional ones', () => {
        const content = `=== start ===
Hello
-> introduction

=== introduction ===
{
    - GetStoryFlag("met_before"):
        -> reunion
    - else:
        -> first_meeting
}

=== reunion ===
Nice to see you again!
-> END

=== first_meeting ===
Nice to meet you!
-> END`;
        const result = parseInk(content);

        const startKnot = result.knots.find(k => k.name === 'start');
        const introKnot = result.knots.find(k => k.name === 'introduction');

        // start knot should have a standalone divert
        expect(startKnot?.diverts).toHaveLength(1);
        expect(startKnot?.diverts[0].context).toBe('standalone');

        // introduction knot should have conditional diverts
        const conditionalDiverts = introKnot?.diverts.filter(d => d.context === 'conditional');
        expect(conditionalDiverts).toHaveLength(2);
      });
    });

    describe('allStoryFlags collection', () => {
      it('should collect all unique story flags from the file', () => {
        const content = `=== start ===
~ SetStoryFlag("flag_one")
-> middle

=== middle ===
~ SetStoryFlag("flag_two")
~ RemoveStoryFlag("flag_one")
-> check

=== check ===
{
    - GetStoryFlag("flag_two"):
        -> end_good
    - else:
        -> end_bad
}

=== end_good ===
Good ending
-> END

=== end_bad ===
Bad ending
-> END`;
        const result = parseInk(content);

        expect(result.allStoryFlags).toContain('flag_one');
        expect(result.allStoryFlags).toContain('flag_two');
        expect(result.allStoryFlags).toHaveLength(2);
      });

      it('should return empty array when no flags are used', () => {
        const content = `=== start ===
Hello
-> END`;
        const result = parseInk(content);

        expect(result.allStoryFlags).toHaveLength(0);
      });

      it('should sort flags alphabetically', () => {
        const content = `=== start ===
~ SetStoryFlag("zebra_flag")
~ SetStoryFlag("alpha_flag")
~ SetStoryFlag("middle_flag")
-> END`;
        const result = parseInk(content);

        expect(result.allStoryFlags[0]).toBe('alpha_flag');
        expect(result.allStoryFlags[1]).toBe('middle_flag');
        expect(result.allStoryFlags[2]).toBe('zebra_flag');
      });
    });

    describe('Story flags edge cases', () => {
      it('should handle flags with various characters', () => {
        const content = `=== start ===
~ SetStoryFlag("flag_with_numbers_123")
~ SetStoryFlag("CamelCaseFlag")
-> END`;
        const result = parseInk(content);

        expect(result.knots[0].storyFlags).toHaveLength(2);
        expect(result.knots[0].storyFlags[0].name).toBe('flag_with_numbers_123');
        expect(result.knots[0].storyFlags[1].name).toBe('CamelCaseFlag');
      });

      it('should handle whitespace variations in flag syntax', () => {
        const content = `=== start ===
~SetStoryFlag("no_space")
~  SetStoryFlag("extra_spaces")
~ SetStoryFlag( "spaces_in_parens" )
-> END`;
        const result = parseInk(content);

        expect(result.knots[0].storyFlags).toHaveLength(3);
        expect(result.knots[0].storyFlags[0].name).toBe('no_space');
        expect(result.knots[0].storyFlags[1].name).toBe('extra_spaces');
        expect(result.knots[0].storyFlags[2].name).toBe('spaces_in_parens');
      });

      it('should handle conditional without else branch', () => {
        const content = `=== start ===
{
    - GetStoryFlag("optional_path"):
        -> special_path
}
-> default_path

=== special_path ===
Special
-> END

=== default_path ===
Default
-> END`;
        const result = parseInk(content);

        expect(result.knots[0].conditionalBlocks[0].elseDivert).toBeUndefined();
        expect(result.knots[0].conditionalBlocks[0].branches).toHaveLength(1);
      });

      it('should track line numbers correctly for flags', () => {
        const content = `=== start ===
Some text
~ SetStoryFlag("flag_on_line_3")
More text
~ RemoveStoryFlag("flag_on_line_5")
-> END`;
        const result = parseInk(content);

        const setFlag = result.knots[0].storyFlags.find(f => f.operation === 'set');
        const removeFlag = result.knots[0].storyFlags.find(f => f.operation === 'remove');

        expect(setFlag?.lineNumber).toBe(3);
        expect(removeFlag?.lineNumber).toBe(5);
      });
    });
  });
});
