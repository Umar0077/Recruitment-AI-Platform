/**
 * Fictional demonstration transcripts. Each question has three response variants
 * (index 0 = well-developed, 1 = solid, 2 = partial) used by the seed generator.
 * These are illustrative — no real speech is transcribed in this prototype.
 */
export const TRANSCRIPT_BANK: Record<string, string[]> = {
  "CSR-001": [
    "I recently completed my bachelor's in business administration, and during my final year I worked part-time at a mobile accessories store. I really enjoyed talking to customers and helping them pick the right product. That's where I realised I like conversations that lead to a decision. I want to start in sales because I want a career where my effort shows in my results, and where I can keep learning how to communicate better.",
    "I finished my intermediate and I'm currently doing a part-time diploma. I haven't worked in sales formally, but I've helped at my uncle's shop during holidays. I like talking to people and I think sales is a good place to grow and earn based on performance.",
    "I'm a recent graduate and I'm looking for my first job. I think sales would be good for me because I'm a friendly person. I want to learn more about it.",
  ],
  "CSR-002": [
    "First I'd ask a couple of questions to understand what they currently use and what problem they have. Then I'd explain the product in simple words, focusing on two or three benefits that connect to what they told me, not a list of features. I'd give a small example of how it would help in their day, and then check in by asking whether that makes sense or if they'd like me to explain any part again.",
    "I'd keep it simple and explain what the product does and why it's useful. I'd use an example they can relate to and ask if they have questions at the end.",
    "I would tell them all the features and explain the price, and then tell them why it's better than other products.",
  ],
  "CSR-003": [
    "I'd respect it first, so they don't feel pressured. I might say, 'That's completely fair — can I ask what you're using at the moment?' If they share something, I can see whether there's a genuine fit. If there isn't, I'd thank them for their time and leave the door open politely. The goal is to understand them, not to force a yes.",
    "I'd say I understand and ask if I can share one quick point that might be useful. If they still aren't interested, I'd thank them and end the call politely.",
    "I would try to explain the offer again and tell them it's a good deal so they reconsider.",
  ],
  "CSR-004": [
    "I'd remind myself that rejection usually isn't personal — it's part of the numbers in sales. After a tough call I'd take a moment, note what I could do differently, and move on. If my trainer said I needed to improve, I'd ask for specific examples, listen to my call recordings with them if possible, and practise those parts. I'd rather hear feedback early than repeat the same mistakes.",
    "I'd try to stay positive and not take it personally. If my trainer gives feedback, I'd listen and try to apply it on my next calls.",
    "Rejection is hard but I would try my best. If the trainer says I need to improve I will work harder.",
  ],
  "FE-001": [
    "I've been closing Final Expense for a little over four years. I started on an inbound campaign for about eighteen months, where I handled warm transfers and did the full close including the application. Then I moved to an outbound campaign for around two years, and most recently I've been on a mixed campaign as a senior closer, where I also helped new closers with call reviews.",
    "I have about two years of FE closing experience across two campaigns. On the first one I was mainly on transfers and closing, and on the second one I handled callbacks and some verification as well.",
    "I worked in FE for some time on a couple of campaigns. I was a closer and handled customers who were transferred to me.",
  ],
  "FE-002": [
    "On my most recent campaign I was averaging around the mid-range of the floor for monthly closes, and my CPA count was consistent month to month rather than spiky. What helped most was call structure — I always confirmed the customer's needs before talking about coverage — and reviewing my own recordings every week to tighten my objection responses.",
    "My numbers were generally around the team average. What helped me was following the script closely and staying consistent with callbacks.",
    "My performance was good. I usually met my targets most months.",
  ],
  "FE-003": [
    "I'd acknowledge the hesitation directly — trust is a fair concern on the phone. I'd slow down, restate what they told me they wanted to protect, and explain clearly who the carrier is and what the policy does and doesn't cover. I'd invite them to ask anything, and only then ask if they feel comfortable moving forward. If they need time, I'd schedule a callback rather than push.",
    "I'd reassure them that the company is reliable and explain the benefits again. I'd answer their questions and then try to close.",
    "I would tell them many customers have taken the policy and it's very good, so they should not worry.",
  ],
  "FE-004": [
    "I open by building rapport and confirming the customer's details and needs. Then I explain coverage options in plain language, matched to their budget. Before closing I summarise what they're getting, confirm they understand the premium and the key terms, and follow the required disclosures word for word. Confidence comes from being transparent — compliance and a good close go together.",
    "I start with an introduction, find out what they need, present the plan and handle objections, then complete the application. I follow the compliance script during verification.",
    "I introduce myself, present the plan, and then close the sale and fill the application.",
  ],
};

/** Illustrative observation sentences keyed by response level. */
export const OBSERVATIONS: Record<string, string[]> = {
  "CSR-001": [
    "Response connected relevant part-time customer experience to a clear motivation for a sales career.",
    "Candidate gave a relevant background summary; motivation was stated but could be explored further.",
    "Response was brief and gave limited detail about background or motivation for the role.",
  ],
  "CSR-002": [
    "Candidate provided a relevant explanation of the product's benefits and used a clear, structured response.",
    "Response used a relatable example; checking for understanding was mentioned briefly.",
    "Response focused on features and price rather than the customer's needs.",
  ],
  "CSR-003": [
    "Response acknowledged the customer's position and used a question to continue the conversation respectfully.",
    "Candidate handled the objection politely; follow-up questioning was limited.",
    "Response repeated the offer rather than exploring the customer's hesitation.",
  ],
  "CSR-004": [
    "Candidate described a specific approach to rejection and an active way of using trainer feedback.",
    "Response showed openness to feedback; specific improvement steps were not described.",
    "Response expressed willingness to improve but without concrete actions.",
  ],
  "FE-001": [
    "Candidate described prior closing responsibilities across several campaigns; additional verification may be required.",
    "Candidate outlined two campaigns and responsibilities; durations should be verified with references.",
    "Response referenced FE experience in general terms; campaign details and durations were not specified.",
  ],
  "FE-002": [
    "Candidate described consistent performance and specific habits behind it; figures are self-reported and unverified.",
    "Candidate reported team-average performance; supporting factors were described briefly.",
    "Response did not include specific performance figures; recruiter follow-up recommended.",
  ],
  "FE-003": [
    "Response addressed the trust concern directly and described a transparent, non-pressuring next step.",
    "Response addressed customer hesitation but did not fully explain the next steps.",
    "Response relied on general reassurance rather than addressing the specific trust concern.",
  ],
  "FE-004": [
    "Candidate walked through a structured closing process and explicitly linked disclosures to customer confidence.",
    "Candidate described a complete process; compliance was mentioned at verification only.",
    "Response described a basic sequence; compliance steps were not referenced.",
  ],
};

/** Illustrative category-level notes, keyed by official question id (levels: strong, solid, partial). */
export const CRITERION_EXPLANATIONS: Record<string, [string, string, string]> = {
  "CSR-001": [
    "Introduced background clearly and linked it to a specific motivation for a sales career.",
    "Gave a relevant introduction; motivation for sales could be explored further.",
    "Introduction was brief, with limited detail on background or motivation.",
  ],
  "CSR-002": [
    "Explained benefits in plain language and checked the listener's understanding.",
    "Explained the product clearly; checking for understanding was brief.",
    "Focused on features or price rather than what the customer needs.",
  ],
  "CSR-003": [
    "Respected the objection and used a question to keep the conversation going without pressure.",
    "Handled the objection politely; follow-up questioning was limited.",
    "Repeated the offer instead of exploring why the customer was not interested.",
  ],
  "CSR-004": [
    "Described a concrete way to recover from rejection and to act on trainer feedback.",
    "Showed openness to feedback; specific improvement steps were not described.",
    "Stated willingness to improve without concrete actions.",
  ],
  "FE-001": [
    "Described campaigns, responsibilities, and durations in detail; claims need verification.",
    "Described relevant campaigns and duties; durations should be verified.",
    "Referred to FE experience in general terms only.",
  ],
  "FE-002": [
    "Gave specific performance figures and the habits behind them; figures are self-reported.",
    "Reported performance in general terms with brief supporting factors.",
    "No specific figures were given; recruiter follow-up recommended.",
  ],
  "FE-003": [
    "Addressed the trust concern directly and proposed a transparent, respectful next step.",
    "Addressed the hesitation but next steps were not fully explained.",
    "Relied on general reassurance rather than the specific trust concern.",
  ],
  "FE-004": [
    "Walked through a full closing structure and linked compliance to customer confidence.",
    "Described the main closing steps; compliance mentioned only at verification.",
    "Described a basic sequence without referencing compliance.",
  ],
};
