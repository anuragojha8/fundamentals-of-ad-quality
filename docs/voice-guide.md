# Voice guide: writing like Anurag

Drawn from "Towards LLM, Part 1", "Sisyphus, Camus, and Four Tank-Tops", and "Entropy is Relentless". Apply it to all prose: chapter text, callouts, quiz explanations, widget captions. Don't apply it to code comments or test messages; keep those plain.

## Who's talking
- **I** for opinions and asides, **you** for the reader, **we** when we build or figure something out together. The book is Anurag walking a friend through his stack, not a textbook narrator.
- Opinions are stated as opinions: "here's how I think about it", "in my opinion", "my hypothesis is".
- **Never invent biography.** Where a real work story would land, leave `<!-- ANURAG: … -->` with a prompt describing what kind of story fits.

## How to teach
1. **Start embarrassingly simple.** Show the dumbest version that works (the unigram model), then show exactly how it breaks ("the in a of its sun").
2. **Ask before you answer.** "If I were to ask you to …, how would you do it?" Give the reader a beat to think.
3. **Escalate one step at a time.** "So let's try and do something better!" "More context is always better, right?" Then the catch.
4. **A concrete example first, the definition second.** If there's a formal definition, give it after the intuition ("If we want to be more technical…").
5. **Show the output and react to it.** "Pretty neat, right?"
6. Use connective phrases like "You know where I'm going with this", "Anyway", and "Coming back to …" to keep momentum.

## Humor and texture
- Self-deprecating vanity: "devastatingly handsome", "Yours Truly", "arrogant Delhi boy".
- Pop-culture cues and asides in parentheses: "(Cue: A Whole New World)", "(oops I mean Bard)", "(Bummer)".
- Casual intensifiers, used sparingly: honestly, frankly, look, pretty neat, freakin' cool, a vibe.
- **No profanity or dating material in the book.** Keep the energy but stay workplace-shareable.

## The Percy Jackson thing
Anurag's friends say he writes like the Percy Jackson novels. Lean into that on purpose:
- **Chapter subtitles (the dek under each title) in Riordan style**: first-person, past or present tense, slightly absurd, and literally true about the chapter. Example: "I Accidentally Run Three Thousand Auctions Before Breakfast." The plain `<h1>` stays for navigation.
- **Deadpan understatement after something big**: "No pressure." "Enjoy it while it lasts."
- **Direct warnings to the reader**: "Look, I didn't want to be the one to tell you this, but…"
- **Hyperbole with a straight face**: "Your user has scrolled past, closed the app, and started a new hobby."
- **Keep it grounded.** The jokes ride on top of correct, precise content. In dense technical passages (derivations, metric definitions), keep the explanation clean and put the humor before or after it, not inside it.

## Rhythm
- Mix long, conversational run-on sentences with one-line punches: "Absurd, isn't it?" "Not ever. Not even once."
- Rhetorical questions to turn a section.
- Short paragraphs. One idea each.

## Openings and endings
- **Open** in the middle of a thought, conversational: "Okay, so…", "You know, I think…".
- **End** with a callback to the opening image, and a light sign-off that points to the next chapter: "See ya next time", "we'll build it next time because I'm tired now".

## Keep from the current book
- Technical precision: formulas, exact numbers, correct terminology.
- The callout types (Intuition, In your job, Common trap, Going deeper), but written in this voice.
- Pebble as the running example.
