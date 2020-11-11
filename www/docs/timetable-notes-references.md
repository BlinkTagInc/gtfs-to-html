---
id: timetable-notes-references
title: timetable_notes_references.txt
---

This is an optional, non-standard file called `timetable_notes_references.txt` which can be included in an agency's GTFS. This file specifies where notes that are defined in [`timetable_notes.txt`](/docs/timetable-notes) should be placed. Using `timetable_notes_references.txt` notes can be placed on specific stops, trips, stoptimes, routes or timetables.

### Column Definitions

| column name | description |
| ----------- | ----------- |
| `note_id` | The `note_id` that this reference refers to. |
| `timetable_id` | Use to attach a note to an entire timetable, or in combination with `stop_id` to restrict which timetable a a note should show up on. Optional. |
| `route_id` | Use to attach a note to all timetables for a specific route, or in combination with `stop_id` to restrict which timetable a a note should show up on. Optional. |
| `trip_id` | Use to attach a note to a specific trip row or column, or in combination with `stop_id` to restrict to a specific stoptime. Optional. |
| `stop_id` | Use to attach a note to a specific stop row or column, or in combination with `trip_id` to restrict to a specific stoptime. Optional. |
| `stop_sequence` | Use along with a `stop_id` to attach a note to a specific stop and stop_sequence. Useful for routes that serve the same stop more than once in a trip such as circular routes. Optional. |
| `show_on_stoptime` | A binary value that indicates whether this note should show up on all stoptimes of a trip or stop that it applies to. Valid options are `0` and `1`.  Optional, defaults to `0`. |

### Example

```csv
note_id,timetable_id,route_id,trip_id,stop_id,stop_sequence,show_on_stoptime
1,131,,,,,
2,,17,,,,
3,,,17010,,,1
4,,,,254514,,
5,,,,254514,11,
6,,,17010,235269,,
```

Note `1` applies to only a specific timetable and it applies to the entire timetable. No other timetables will have this note.

Note `2` applies only to a specific route. All timetables for that route will have this note.

Note `3` applies only to a specific trip. Because it has `show_on_stoptime` set to `1` it shows up in the trip header and also for each timepoint of that trip in all timetables that have that trip.

Note `4` applies only to a specific stop. It shows up by the stop name in all timetables that use that stop.

Note `5` applies only to a specific stop and stop_sequence. It shows up by the stop name only if that stop has that stop_sequence value `11` for any trip in that timetable.

Note `6` applies only to a specific stop and trip. It only shows up by the timepoint that matches the specific trip_id and stop_id.

An example of this file is located in [examples/timetable_notes_references.txt](https://github.com/BlinkTagInc/gtfs-to-html/blob/master/examples/timetable_notes_references.txt).
