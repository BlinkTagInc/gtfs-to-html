---
slug: timetables_as_csv
title: New Feature - GTFS timetables as CSV
authors: brendannee
tags: [csv]
---

GTFS-to-HTML Version 2.3.0 adds support for exporting timetables as CSV. Setting the [outputFormat](https://gtfstohtml.com/docs/configuration#outputformat) configuration to `csv` will generate CSV files instead of HTML. One CSV file per timetable will be generated.

An example of a CSV timetable:

```csv
,San Francisco Ferry Building,Vallejo Ferry Terminal,Mare Island Ferry Terminal
Run #1,10:30am,11:30am,
Run #2,11:30am,12:30pm,
Run #3,1:50pm,2:50pm,
Run #4,2:50pm,3:50pm,
Run #5,4:10pm,5:10pm,5:25pm
Run #6,5:10pm,6:10pm,6:25pm
Run #7,6:30pm,7:30pm,
Run #8,8:50pm,9:50pm,10:05pm
```

Timetables in CSV respect the `orientation` set in `timetables.txt` or `defaultOrientation` in `config.json`, they can be either `horizontal` or `vertical`.
