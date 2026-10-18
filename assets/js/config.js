/* AISSKO site settings.
   This is the one file to change when a form key, store page, demo, or purchase link goes live.
   Anything left empty ("") keeps its safe fallback: buttons send visitors to the contact form
   and the forms open an email draft instead. */
window.AISSKO = {
  // Where messages go. Shown on the site and used for the email fallback.
  email: "hello@aissko.com",

  // Form delivery. Create a free form endpoint (for example at web3forms.com or formspree.io),
  // then paste its URL (and its public access key, if it gives one) here.
  //   Web3Forms:  formEndpoint "https://api.web3forms.com/submit"  + formAccessKey "<your key>"
  //   Formspree:  formEndpoint "https://formspree.io/f/<your id>"  + formAccessKey ""
  formEndpoint: "",
  formAccessKey: "",

  // Crew database (Supabase). When both are filled in, the People Services forms save straight into it.
  // Paste the Project URL and the PUBLIC "anon" key (never the secret key). See crew-backend/README.md.
  supabaseUrl: "",
  supabaseKey: "",

  // Live links. Fill one in and its button on the site switches from "request" to the real action.
  links: {
    buy: {
      // "ops-radar-ex": "https://buy.stripe.com/...",
    },
    demo: {
      // "ops-radar-ex": "https://...",
    },
    download: {
      "formquest": "downloads/formquest-1.5.zip"
    },
    store: {
      // "beltline-bully-steam": "https://store.steampowered.com/app/...",
      // "beltline-bully-ios": "https://apps.apple.com/...",
      // "beltline-bully-android": "https://play.google.com/store/apps/details?id=...",
      // "the-long-run-steam": "https://store.steampowered.com/app/...",
    }
  },

  // Two-letter codes of states that have an active contractor crew (shown in cyan on the People Services map).
  // Example: ["GA", "TX", "VA"]
  activeStates: []
};
