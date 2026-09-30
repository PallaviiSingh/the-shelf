# Data schema — Pallavi's Bookshelf

Two kinds of data, kept strictly separate:

- **Library data** (this `data/` folder) — shared, shippable, public. The catalogue.
- **Personal data** (browser localStorage at runtime, exportable to `personal-backup.json`) — private. Progress, ratings, quotes, personal fun-facts, reading dates. *Never* stored in these files.

---

## `data/books/<slug>.json`

```jsonc
{
  "slug": "the-master-and-margarita",        // kebab-case id, stable
  "title": "The Master and Margarita",
  "subtitle": null,
  "authors": ["mikhail-bulgakov"],            // -> data/authors/<slug>.json
  "translator": "...",                         // if translated, else null
  "originalLanguage": "Russian",
  "translated": true,

  "originalPublicationYear": 1967,            // year the WORK first appeared (filter uses this)
  "edition": {
    "year": 2016,
    "publisher": "Vintage / Random House",
    "series": "Vintage Classic Russians Series",
    "isbn": "1784871931",
    "pageCount": 448                          // this edition, for the progress bar
  },

  "cover": {
    "file": "assets/covers/the-master-and-margarita.jpg",
    "source": "openlibrary",                  // openlibrary | google | manual | generated
    "match": "isbn",                          // isbn (exact edition) | title-search (a cover) | generated
    "sourceUrl": "https://...",
    "dominantColor": "#7a1f1f"                // extracted at build time -> the book's color-world
  },

  "genre": "Fiction",
  "subgenres": ["Classic", "Magical Realism"],
  "region": "Russia",
  "tags": ["Soviet", "satire", "devil", "Moscow"],

  "moods": ["dreamlike", "satirical", "romantic"],   // from taxonomies/moods.json
  "difficulty": "challenging",                        // from facets.json
  "pace": "steady",

  "vibeProfile": {                            // powers the natural-language suggester
    "occasions": ["to be absorbed for hours", "on a rainy day", "in bed at night"],
    "sensory": ["snowbound Moscow", "candlelit", "carnival", "uncanny"],
    "oneLine": "A devil visits atheist Moscow and everything turns gloriously strange."
  },

  "summary": "~100 words, accurate, factual.",
  "summarySource": "knowledge | verified",    // 'verified' means checked against a cited source
  "whyReadIt": "Editorial shelf-talker in my voice — why pick it up.",
  "awards": ["..."],                          // factual; empty array if none

  "funFacts": [                               // sourced facts shown at random with the book
    { "text": "...", "source": "https://...", "type": "sourced" }
    // personal fun-facts are added at runtime and merged in, type: "personal"
  ],

  "physicalShelf": "D1"                        // mirrors the real bookshelf for Shelf View
}
```

## `data/authors/<slug>.json`

```jsonc
{
  "slug": "mikhail-bulgakov",
  "name": "Mikhail Bulgakov",
  "birthYear": 1891,
  "deathYear": 1940,
  "nationality": "Russian",
  "bio": "~60-80 words, factual.",
  "photo": {
    "file": "assets/authors/mikhail-bulgakov.jpg",
    "source": "wikimedia",
    "sourceUrl": "https://en.wikipedia.org/wiki/Mikhail_Bulgakov",
    "license": "Public domain",               // captured per image; attribution honored
    "attribution": "..."
  },
  "books": ["the-master-and-margarita"]        // their books in this library
}
```

## Controlled vocabularies
- `taxonomies/moods.json` — the mood palette (+ color hints)
- `taxonomies/genres.json` — 2-level genres
- `taxonomies/facets.json` — difficulty, pace, reading-occasion vocab
- `taxonomies/editions.json` — collectible series / publishers
- `library.json` — lightweight master index (generated from the per-book files)
