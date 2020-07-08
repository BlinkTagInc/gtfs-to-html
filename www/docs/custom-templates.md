---
id: custom-templates
title: Custom Templates
---

GTFS-to-HTML includes a default template for generating HTML timetables in [`views/timetable`](https://github.com/BlinkTagInc/gtfs-to-html/tree/master/views/timetable). It is built using (pug)[https://pugjs.org/]. You can create your own template using the default one as a starting point.

Copy the `views/timetable` folder to `views/custom/myagency` and make any modifications needed. All files within the `/views/custom` folder are .gitignored. 

A template must include at the very least pug templates called `timetablepage.pug`, `timetablepage_full.pug`,  `overview.pug`, and `overview_full.pug`.
