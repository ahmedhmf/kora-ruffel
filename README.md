# Kora Raffle

Angular raffle app for selecting winners from submitted ball designs, with an Instagram-friendly fullscreen draw animation and winner reveal.

## Run locally

```bash
npm install
npm start
```

Then open the URL printed by Angular, normally `http://localhost:4200`.

## Included

- Participant name + Instagram handle
- Ball design image upload
- Browser localStorage persistence
- Secure winner selection using `crypto.getRandomValues()`
- Previous-winner exclusion
- Countdown and roulette-style slowdown
- Fullscreen winner reveal with confetti
- Winner history
- Responsive recording stage

The winner is selected before the presentation animation begins, so animation timing does not determine the result.
