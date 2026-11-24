// Edit freely. `answer` is the index of the correct option (0-3).
export const settings = {
  title: "Mini Shop Quiz",
  readSeconds: 4,       // time to read the question before the options appear
  answerSeconds: 20,    // time to answer
  maxPoints: 1000,      // correct and instant. A correct answer at the buzzer is worth half
  prizes: [3, 2, 1],    // mentoring sessions for 1st, 2nd and 3rd place
};

export const questions = [
  { q: "Why did we add a /api/health endpoint to the server?", options: ["To store the user's health data", "So monitors and hosting platforms can check the server is alive, and measure uptime", "To make the API faster", "Express requires it to start"], answer: 1 },
  { q: "A fetch from the page to the API fails with a CORS error, but the same request works in Postman. Who blocked it?", options: ["The database", "Express crashed", "The browser", "Postman fixed it"], answer: 2 },
  { q: "How did we fix the CORS error?", options: ["We told the browser to ignore errors", "The server named the website that is allowed to read its answers", "We moved the client into the server folder", "We turned off the API"], answer: 1 },
  { q: "What does seeding a database mean?", options: ["Deleting all the tables", "Backing it up every night", "Filling a fresh database with starting data", "Encrypting the data"], answer: 2 },
  { q: "Why do we write VALUES ($1, $2, $3, $4) instead of gluing user input into the SQL string?", options: ["It makes the query shorter", "It prevents SQL injection", "Postgres cannot read quotes", "It speeds up the network"], answer: 1 },
  { q: "Why is DATABASE_URL kept in a .env file that is listed in .gitignore?", options: ["It contains a secret and differs between machines", "Git cannot store text files", "It makes npm install faster", "React needs it there"], answer: 0 },
  { q: "Why did we move the fetching and filtering out of App into a custom hook?", options: ["Hooks run faster than components", "To separate the logic from the UI, so the component only decides what to draw", "TypeScript requires hooks", "To avoid writing JSX"], answer: 1 },
  { q: "Which HTTP status code means a product was created successfully?", options: ["200", "204", "404", "201"], answer: 3 },
  { q: "The product with category \"Gadgets\" was saved and no filter could find it. Why?", options: ["Neon blocked it", "The server did not validate the data", "The filters were broken", "React hid it"], answer: 1 },
  { q: "The form already validates the product. Why does the server validate too?", options: ["Requests can come from Postman or scripts that never use our form", "Zod only works on the server", "The form validation is optional in React", "To make the page load faster"], answer: 0 },
  { q: "When did we reach for a zustand store instead of local state?", options: ["For the category filter, which only one component uses", "For the cart, which many components in different places need", "For every variable in the app", "To replace the database"], answer: 1 },
  { q: "Deleting a product id that does not exist should return...", options: ["200", "201", "500", "404"], answer: 3 },
];
