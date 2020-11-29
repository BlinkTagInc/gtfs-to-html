module.exports = {
  title: 'GTFS-to-HTML',
  tagline: 'Generate human-readable HTML timetables from GTFS',
  url: 'https://gtfstohtml.com',
  baseUrl: '/',
  favicon: 'img/favicon.ico',
  organizationName: 'blinktaginc', // Usually your GitHub org/user name.
  projectName: 'gtfs-to-html', // Usually your repo name.
  themeConfig: {
    navbar: {
      title: 'GTFS-to-HTML',
      logo: {
        alt: 'GTFS-to-HTML Logo',
        src: 'img/gtfs-to-html-logo.svg'
      },
      items: [
        {
          to: 'docs/',
          activeBasePath: 'docs',
          label: 'Documentation',
          position: 'left'
        },
        { to: 'blog', label: 'Blog', position: 'left' },
        {
          href: 'https://www.npmjs.com/package/gtfs-to-html',
          label: 'NPM',
          position: 'right'
        },
        {
          href: 'https://github.com/blinktaginc/gtfs-to-html',
          label: 'GitHub',
          position: 'right'
        }
      ]
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Info',
          items: [
            {
              label: 'Documentation',
              to: 'docs/'
            },
            {
              label: 'Blog',
              to: 'blog'
            }
          ]
        },
        {
          title: 'Download',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/blinktaginc/gtfs-to-html'
            },
            {
              label: 'NPM',
              href: 'https://www.npmjs.com/package/gtfs-to-html'
            }
          ]
        },
        {
          title: 'Acknowledgements',
          items: [
            {
              label: 'Docusaurus',
              href: 'https://docusaurus.io'
            },
            {
              label: 'Contributors',
              href: 'https://github.com/BlinkTagInc/gtfs-to-html/blob/master/package.json#L13'
            }
          ]
        }
      ],
      copyright: `Copyright © ${new Date().getFullYear()} BlinkTag, Inc. Built with Docusaurus.`
    }
  },
  presets: [
    [
      '@docusaurus/preset-classic',
      {
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          // Please change this to your repo.
          editUrl:
            'https://github.com/blinktaginc/gtfs-to-html/edit/master/www/'
        },
        blog: {
          showReadingTime: true,
          // Please change this to your repo.
          editUrl:
            'https://github.com/blinktaginc/gtfs-to-html/edit/master/www/blog/'
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css')
        }
      }
    ]
  ]
};
