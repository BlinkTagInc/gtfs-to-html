---
id: timetable-pages
title: timetable_pages.txt
---

This is an optional, non-standard file called `timetable_pages.txt` which can be included in an agency's GTFS. This file specifies which HTML timetable to group together into a single HTML page.

Agencies often want to show both directions of a route, or timetables for weekdays and weekends on the same HTML page.

### Column Definitions

| column name | description |
| ----------- | ----------- |
| `timetable_page_id` | A unique ID for the timetable page |
| `timetable_page_label` | A label that will show up on the top of the page. Optional, defaults to using route name. |
| `filename` | The filename to use for the generated HTML file. Optional, defaults to `timetable_page_id` with file extension `.html`, for example `1.html`. |

### Example

```csv
timetable_page_id,timetable_page_label,filename
1,"Cloverdale, Healdsburg, Windsor, Santa Rosa","60.html"
2,"Sebastopol, Rohnert Park, Cotati","26.html"
```

An example of this file is located in [examples/timetable_pages.txt](https://github.com/BlinkTagInc/gtfs-to-html/blob/master/examples/timetable_pages.txt).
