# Aiisko-Website
Website Hosting for Aissko llc

## AISSKO website

**AISSKO — Human Data.** *The segue between data and humans.*

A fast, plain HTML/CSS/JS website (no build step, no frameworks) for AISSKO's four divisions:
People Services, Apps, Training, and Games.

| Page | File |
| --- | --- |
| Home | `index.html` |
| People Services (service lines, state map, "request crews" and "join the network" forms) | `people.html` |
| Apps (Ops Suite, free and everyday tools, creator tools, buying and support) | `apps.html` |
| Training | `training.html` |
| Games (Beltline Bully, The Long Run) | `games.html` |
| About, Contact, Privacy, 404 | `about.html`, `contact.html`, `privacy.html`, `404.html` |

Everything shared lives in `assets/` (`css/site.css`, `js/site.js`, `js/config.js`, fonts, images).
`downloads/formquest-1.5.zip` is the free FormQuest browser extension.

## Put it online (GitHub Pages)

1. GitHub → **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`** → Save.
2. Your site appears at `https://afroboyee.github.io/Aiisko-Website/` within a minute or two.

### Use your own domain
1. In **Settings → Pages → Custom domain**, enter your domain (GitHub adds a `CNAME` file for you) and tick **Enforce HTTPS** once it is available.
2. At your domain registrar, add the DNS records GitHub lists in its Pages docs: four `A` records for the bare domain (`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`) and a `CNAME` for `www` pointing to `<owner>.github.io`.
3. The pages assume the domain **aissko.com** for the social-preview image (`og:image` in each page's `<head>`) and `hello@aissko.com` for email. If either is different, search the project for those two strings and replace them (and update `email` in `assets/js/config.js`).

## Make the forms deliver to your inbox

GitHub Pages is static, so forms need a form service. Until one is connected, the forms open a ready-to-send email instead.

1. Create a free account at [web3forms.com](https://web3forms.com) (or [formspree.io](https://formspree.io)) and get your form key/endpoint.
2. Open `assets/js/config.js` and fill in `formEndpoint` and, for Web3Forms, `formAccessKey`.

Web3Forms: `formEndpoint: "https://api.web3forms.com/submit"` and `formAccessKey: "<your key>"`.
Formspree: `formEndpoint: "https://formspree.io/f/<your id>"` and leave `formAccessKey` empty.

## Turn buttons into real links

Every "Request a demo", "Ask about a license", and "Get launch updates" button switches to its live link as soon as you add one in `assets/js/config.js` (`links.demo`, `links.buy`, `links.store`, `links.download`). Payment links from Stripe, Lemon Squeezy, or Gumroad work for `links.buy`; Steam, App Store, and Google Play pages work for `links.store`. Leave a link empty to keep the safe fallback (send the visitor to the contact form).

## Show which states have an active crew

Add two-letter codes to `activeStates` in `assets/js/config.js`, for example `["GA", "TX"]`. Those tiles turn cyan on the People Services map and say "Active crew".

## Notes

- **Privacy page**: a plain-language starting point. Have it reviewed before collecting contractor applications in volume.
- **Screenshots** show AISSKO's own apps running with sample or example data only.
- **Third-party names** (ServiceNow, Microsoft 365, Intune, Steam, etc.) appear only to describe compatibility and are trademarks of their owners.
- **Fonts** (Figtree, Source Serif 4) are self-hosted under the SIL Open Font License; see `assets/fonts/`.
