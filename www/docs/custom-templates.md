---
id: custom-templates
title: Custom Templates
---

GTFS-to-HTML includes a default template for generating HTML timetables in [`views/default`](https://github.com/BlinkTagInc/gtfs-to-html/tree/master/views/default). It is built using [pug](https://pugjs.org/). 

You can create your own template using the default one as a starting point.

* Copy the `views/default` folder to `views/custom/myagency`.
* Modifiy as needed.
* All files within the `/views/custom` folder are .gitignored. 
* A template must include pug templates called `timetablepage.pug`, `timetablepage_full.pug`,  `overview.pug`, and `overview_full.pug` (but can include any additional template files you'd like).

The default template uses [Tailwind CSS](https://tailwindcss.com) as a basis for styles, but you can use any CSS framework you'd like if you create a custom template.
