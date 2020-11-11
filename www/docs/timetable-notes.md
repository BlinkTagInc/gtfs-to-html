---
id: timetable-notes
title: timetable_notes.txt
---

This is an optional, non-standard file called `timetable_notes.txt` which can be included in an agency's GTFS. This file specifies notes about specific stops, trips, stoptimes, routes or timetables that should be included in the HTML output of a timetable.

The symbol and text of each note is defined in this file while the locations that each note should be placed is defined in [`timetable_notes_references.txt`](/docs/timetable-notes-references). This allows one note to be used in multiple places, such as two different trips, without having to duplicate the text of the note multiple times.

Notes can have a `symbol` specified or can be left blank and GTFS-to-HTML will assign a letter a-z to each note (falling back to using integers if more than 26 symbols are needed).

### Column Definitions

| column name | description |
| ----------- | ----------- |
| `note_id` | A unique ID for the timetable note |
| `symbol` | The symbol used to indicate the note, such as `§`. Optional, if omitted a letter of the alphabet starting with `a` will be used. |
| `note` | The text of the note, such as "This stop is sometimes underwater". |

### Example

```csv
note_id,symbol,note
1,,"No service during baseball games"
2,,"No express service during a full moon"
3,,"Trip is cancelled if drawbridge is up"
4,,"This stop is sometimes underwater"
5,,"Driver will only stop if prearranged by fax"
6,§,"Vehicle can arrive early if leap second is added during trip"
```

An example of this file is located in [examples/timetable_notes.txt](https://github.com/BlinkTagInc/gtfs-to-html/blob/master/examples/timetable_notes.txt).
