const STORAGE_KEYS = {
  profile: "pipeline-profile-v1",
  jobs: "pipeline-jobs-v1",
  resumes: "pipeline-resume-versions-v1",
};

const DEFAULT_PROFILE = {
  name: "",
  linkedin: "https://www.linkedin.com/in/kiransai006",
  title: "DevOps Engineer",
  location: "Ireland",
  years: 4,
  minimumYears: 4,
  skills: [],
};

const STATUS_OPTIONS = ["Saved", "Applied", "Interview", "Offer", "Archived"];
const STATUS_BADGES = {
  Saved: "status-saved",
  Applied: "status-applied",
  Interview: "status-interview",
  Offer: "status-offer",
  Archived: "status-archived",
};
const SOURCE_BOARDS = [
  {
    key: "linkedIn",
    logo: "in",
    name: "LinkedIn Jobs",
    description: "Professional opportunities and recruiter listings.",
    url: (query, location) =>
      `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}`,
  },
  {
    key: "indeed",
    logo: "indeed",
    name: "Indeed Ireland",
    description: "Roles from employers, agencies, and company career pages.",
    url: (query, location) =>
      `https://ie.indeed.com/jobs?q=${encodeURIComponent(query)}&l=${encodeURIComponent(location)}`,
  },
  {
    key: "google",
    logo: "G",
    name: "Google Jobs",
    description: "Job search results collected from across the web.",
    url: (query, location) =>
      `https://www.google.com/search?q=${encodeURIComponent(`${query} jobs ${location}`)}&ibp=htl;jobs`,
  },
  {
    key: "irishjobs",
    logo: "IJ",
    name: "IrishJobs search",
    description: "Search the web for current listings on IrishJobs.",
    metadata: "Google search scoped to IrishJobs postings",
    url: (query, location) =>
      `https://www.google.com/search?q=${encodeURIComponent(`site:irishjobs.ie ${query} ${location}`)}`,
  },
  {
    key: "glassdoor",
    logo: "Gd",
    name: "Glassdoor",
    description: "Find listings and explore employer information.",
    url: (query, location) =>
      `https://www.glassdoor.ie/Job/ireland-jobs-SRCH_IL.0,7_IN70.htm?sc.keyword=${encodeURIComponent(query)}&locT=C&locId=70&locKeyword=${encodeURIComponent(location)}`,
  },
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let toastTimeout;
let generatedLatex = "";
let resumeVersions = [];
let currentResumeAnalysis = null;
let currentResumeJob = "";

const RESPONSIBILITY_CATALOG = [
  { name: "Automation & toil reduction", aliases: ["automation", "automate", "toil"] },
  { name: "CI/CD & software delivery", aliases: ["CI/CD", "CI CD", "continuous integration", "continuous delivery", "continuous deployment", "deployment pipeline"] },
  { name: "Infrastructure as code", aliases: ["infrastructure as code", "IaC", "Terraform", "Ansible"] },
  { name: "Production operations", aliases: ["production environment", "production system", "production systems", "operate production"] },
  { name: "Monitoring & observability", aliases: ["observability", "monitoring", "alerting", "logging"] },
  { name: "Incident response & troubleshooting", aliases: ["incident response", "incident management", "incident", "troubleshooting", "root cause analysis", "RCA"] },
  { name: "Reliability & availability", aliases: ["reliability", "high availability", "fault tolerant", "fault-tolerant", "SRE"] },
  { name: "Containers & orchestration", aliases: ["container", "Kubernetes", "Docker", "orchestration"] },
  { name: "Security & access control", aliases: ["security", "RBAC", "access control", "IAM", "vulnerability scanning", "image scanning"] },
  { name: "Runbooks & documentation", aliases: ["runbook", "postmortem", "documentation", "operational procedures"] },
  { name: "Cloud infrastructure", aliases: ["cloud infrastructure", "AWS", "Azure", "cloud platform"] },
  { name: "Networking & systems", aliases: ["networking", "Linux", "DNS", "load balancing"] },
  { name: "Disaster recovery & backup", aliases: ["disaster recovery", "backup", "recovery", "failover"] },
  { name: "Capacity & performance", aliases: ["capacity planning", "scalability", "performance", "autoscaling"] },
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(text, term) {
  const escaped = escapeRegex(term.trim()).replace(/\s+/g, "\\s+");
  if (!escaped) return false;
  const pattern = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i");
  return pattern.test(text);
}

function containsResumeSkill(text, skill) {
  if (skill.name === "Go") {
    return (
      /\bgolang\b/i.test(text) ||
      /\bgo\s*(?:\(|\/)\s*golang\b|\bgo\s+(?:programming|developer|engineer|language)\b/i.test(
        text,
      ) ||
      /(?:^|[\s,/])Go(?=\s*[,;/+|)\].]|$)/.test(text)
    );
  }
  return skill.aliases.some((alias) => containsTerm(text, alias));
}

function resumeCorpus() {
  const data = window.PIPELINE_RESUME;
  const lines = [
    data.name,
    data.headline,
    data.summary,
    ...data.skills.map((skill) => `${skill.label} ${skill.content}`),
    ...data.experience.flatMap((job) => [
      job.role,
      job.employer,
      ...job.bullets,
      job.contribution,
    ]),
    ...data.projects.flatMap((project) => [
      project.name,
      project.details,
      ...project.bullets,
    ]),
    ...data.certifications,
    ...data.education,
  ];
  return lines.join(" ");
}

function extractExperienceRequirement(description) {
  const numeral = description.match(
    /(?:at least|minimum of|minimum|over|more than|around|approximately)?\s*(\d{1,2})\s*(?:\+|plus)?\s*(?:-|–|to)\s*\d{1,2}\s*(?:years?|yrs?)|(?:(?:at least|minimum of|minimum|over|more than|around|approximately)\s*)?(\d{1,2})\s*(?:\+|plus)?\s*(?:years?|yrs?)(?:\s+of\s+(?:relevant\s+)?experience)?/i,
  );
  if (numeral) return Number(numeral[1] || numeral[2]);

  const word = description.match(
    /\b(?:at least|minimum of|minimum)\s+(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:years?|yrs?)\b/i,
  );
  const wordNumbers = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  return word ? wordNumbers[word[1].toLowerCase()] : null;
}

function analyseResumeMatch(description) {
  const corpus = resumeCorpus();
  const requiredSkills = window.PIPELINE_SKILL_CATALOG.filter((skill) =>
    containsResumeSkill(description, skill),
  );
  const matchedSkills = requiredSkills.filter((skill) =>
    containsResumeSkill(corpus, skill),
  );
  const missingSkills = requiredSkills.filter(
    (skill) => !containsResumeSkill(corpus, skill),
  );
  const responsibilities = RESPONSIBILITY_CATALOG.filter((item) =>
    item.aliases.some((alias) => containsTerm(description, alias)),
  );
  const matchedResponsibilities = responsibilities.filter((item) =>
    item.aliases.some((alias) => containsTerm(corpus, alias)),
  );
  const requiredYears = extractExperienceRequirement(description);
  const experienceScore =
    requiredYears === null
      ? null
      : window.PIPELINE_RESUME.yearsExperience >= requiredYears
        ? 100
        : 0;
  const categories = [
    {
      name: "Recognized technical skills",
      score:
        requiredSkills.length === 0
          ? null
          : Math.round((matchedSkills.length / requiredSkills.length) * 100),
      detail:
        requiredSkills.length === 0
          ? "No catalogued skills found in the job description"
          : `${matchedSkills.length} of ${requiredSkills.length} found in your resume`,
      weight: 60,
    },
    {
      name: "Required experience",
      score: experienceScore,
      detail:
        requiredYears === null
          ? "No numeric years-of-experience requirement detected"
          : `Role requests ${requiredYears}+ years; your resume states ${window.PIPELINE_RESUME.yearsExperience}+`,
      weight: 20,
    },
    {
      name: "Role responsibilities",
      score:
        responsibilities.length === 0
          ? null
          : Math.round(
              (matchedResponsibilities.length / responsibilities.length) * 100,
            ),
      detail:
        responsibilities.length === 0
          ? "No catalogued responsibilities found in the job description"
          : `${matchedResponsibilities.length} of ${responsibilities.length} matched`,
      weight: 20,
    },
  ];
  const scoredCategories = categories.filter((category) => category.score !== null);
  const activeWeight = scoredCategories.reduce(
    (total, category) => total + category.weight,
    0,
  );
  const score =
    activeWeight === 0
      ? null
      : Math.round(
          scoredCategories.reduce(
            (total, category) =>
              total + category.score * (category.weight / activeWeight),
            0,
          ),
        );
  return {
    score,
    categories,
    requiredSkills,
    matchedSkills,
    missingSkills,
    responsibilities,
    matchedResponsibilities,
    requiredYears,
  };
}

function renderResumeScore(analysis) {
  const panel = $("#resume-score-panel");
  panel.replaceChildren();

  const star = document.createElement("span");
  star.className = "profile-side-spark";
  star.textContent = "✳";
  const kicker = document.createElement("span");
  kicker.className = "profile-side-kicker";
  kicker.textContent = "JOB-DESCRIPTION ALIGNMENT";
  panel.append(star, kicker);

  const summary = document.createElement("div");
  summary.className = "score-summary";
  const value = document.createElement("div");
  value.className = "score-number";
  value.innerHTML =
    analysis.score === null
      ? "—"
      : `${analysis.score}<span>%</span>`;
  const summaryCopy = document.createElement("div");
  summaryCopy.className = "score-summary-copy";
  const summaryTitle = document.createElement("strong");
  summaryTitle.textContent =
    analysis.score === null ? "Not enough evidence" : "Estimated resume alignment";
  const summaryText = document.createElement("span");
  summaryText.textContent =
    analysis.score === null
      ? "No supported criteria were detected. Try the full job description."
      : "An indicative keyword comparison, not an ATS or hiring prediction.";
  summaryCopy.append(summaryTitle, summaryText);
  summary.append(value, summaryCopy);
  panel.append(summary);

  const categories = document.createElement("div");
  categories.className = "score-categories";
  for (const category of analysis.categories) {
    const row = document.createElement("div");
    row.className = "score-category";
    const title = document.createElement("span");
    title.className = "score-category-title";
    title.textContent = category.name;
    const score = document.createElement("span");
    score.className =
      category.score === null
        ? "score-category-value score-na"
        : "score-category-value";
    score.textContent = category.score === null ? "N/A" : `${category.score}%`;
    const detail = document.createElement("span");
    detail.className = "score-category-detail";
    detail.textContent = category.detail;
    const bar = document.createElement("div");
    bar.className = "score-bar";
    const fill = document.createElement("span");
    fill.className = "score-bar-fill";
    fill.style.width = `${category.score ?? 0}%`;
    bar.append(fill);
    row.append(title, score, detail, bar);
    categories.append(row);
  }
  panel.append(categories);

  if (analysis.matchedSkills.length > 0) {
    const matched = document.createElement("div");
    matched.className = "score-matched-skills";
    const heading = document.createElement("div");
    heading.className = "criteria-label";
    heading.textContent = "MATCHING SKILLS IN YOUR RESUME";
    matched.append(heading);
    const tags = document.createElement("div");
    tags.className = "tag-list";
    for (const skill of analysis.matchedSkills) {
      const tag = document.createElement("span");
      tag.className = "skill-tag";
      tag.textContent = skill.name;
      tags.append(tag);
    }
    matched.append(tags);
    panel.append(matched);
  }

  if (analysis.missingSkills.length > 0) {
    const missing = document.createElement("p");
    missing.className = "score-missing";
    const heading = document.createElement("strong");
    heading.textContent = "Not explicit in the supplied resume: ";
    missing.append(
      heading,
      document.createTextNode(
        analysis.missingSkills.map((skill) => skill.name).join(", "),
      ),
    );
    panel.append(missing);
  }

  const note = document.createElement("p");
  note.className = "score-explainer";
  note.textContent =
    "Skills 60%, experience 20%, responsibilities 20%. Categories without recognizable evidence are excluded and remaining weights are normalized. Only listed resume facts are considered.";
  panel.append(note);
}

function escapeLatex(value) {
  const replacements = {
    "\\": "\\textbackslash{}",
    "&": "\\&",
    "%": "\\%",
    "$": "\\$",
    "#": "\\#",
    "_": "\\_",
    "{": "\\{",
    "}": "\\}",
    "~": "\\textasciitilde{}",
    "^": "\\textasciicircum{}",
  };
  return String(value).replace(/[\\&%$#_{}~^]/g, (character) => replacements[character]);
}

function generateResumeLatex(targetRole, analysis) {
  const data = window.PIPELINE_RESUME;
  const requestedSkillNames = new Set(
    analysis.matchedSkills.map((skill) => skill.name),
  );
  const rankedSkills = data.skills
    .map((group, originalIndex) => ({
      group,
      originalIndex,
      relevance: window.PIPELINE_SKILL_CATALOG.filter(
        (skill) =>
          requestedSkillNames.has(skill.name) &&
          skill.aliases.some((alias) =>
            containsTerm(`${group.label} ${group.content}`, alias),
          ),
      ).length,
    }))
    .sort((a, b) => b.relevance - a.relevance || a.originalIndex - b.originalIndex)
    .map((item) => item.group);
  const rankedSummary = data.summary
    .split(/(?<=\.)\s+/)
    .map((sentence, originalIndex) => ({
      sentence,
      originalIndex,
      relevance:
        analysis.matchedSkills.filter((skill) =>
          containsResumeSkill(sentence, skill),
        ).length +
        analysis.matchedResponsibilities.filter((responsibility) =>
          responsibility.aliases.some((alias) =>
            containsTerm(sentence, alias),
          ),
        ).length,
    }))
    .sort((a, b) => b.relevance - a.relevance || a.originalIndex - b.originalIndex)
    .map((item) => item.sentence)
    .join(" ");

  const resumeLines = [
    String.raw`\documentclass[10pt,a4paper]{article}`,
    "",
    "% ---------- ATS-friendly setup ----------",
    String.raw`\usepackage[utf8]{inputenc}`,
    String.raw`\usepackage[T1]{fontenc}`,
    String.raw`\usepackage[margin=0.5in]{geometry}`,
    String.raw`\usepackage{enumitem}`,
    String.raw`\usepackage{titlesec}`,
    String.raw`\usepackage[hidelinks]{hyperref}`,
    String.raw`\usepackage{lmodern}`,
    String.raw`\input{glyphtounicode}`,
    String.raw`\pdfgentounicode=1`,
    "",
    String.raw`\pagestyle{empty}`,
    String.raw`\setlength{\parindent}{0pt}`,
    String.raw`\setlength{\parskip}{0pt}`,
    "",
    String.raw`\titleformat{\section}{\bfseries\normalsize\uppercase}{}{0em}{}[\titlerule]`,
    String.raw`\titlespacing*{\section}{0pt}{7pt}{4pt}`,
    "",
    String.raw`\setlist[itemize]{leftmargin=1.2em, itemsep=1pt, topsep=2pt, parsep=0pt}`,
    "",
    String.raw`\newcommand{\role}[4]{%`,
    String.raw`  \textbf{#1} \hfill #3 \\`,
    String.raw`  \textit{#2} \hfill \textit{#4}%`,
    "}",
    String.raw`\newcommand{\keycontrib}[1]{\vspace{2pt}\textbf{Key Contribution:} \textit{#1}\vspace{3pt}}`,
    "",
    String.raw`\begin{document}`,
    "",
    "% ---------- HEADER ----------",
    String.raw`\begin{center}`,
    String.raw`  {\large \textbf{${escapeLatex(data.name)}}} \\[2pt]`,
    ...(targetRole
      ? [String.raw`  {\small \textbf{Target Role: ${escapeLatex(targetRole)}}} \\[1pt]`]
      : []),
    String.raw`  {\small \textbf{${escapeLatex(data.headline)}}} \\[1pt]`,
    String.raw`  {\small ${escapeLatex(data.city)} \,|\, ${escapeLatex(data.phone)} \,|\, \href{mailto:${data.email}}{${escapeLatex(data.email)}} \,|\, \href{${data.linkedin}}{LinkedIn} \,|\, \href{${data.github}}{GitHub}}`,
    String.raw`\end{center}`,
    "",
    "% ---------- SUMMARY ----------",
    String.raw`\section{Professional Summary}`,
    escapeLatex(rankedSummary),
    "",
    "% ---------- SKILLS ----------",
    String.raw`\section{Technical Skills}`,
    String.raw`\begin{itemize}[leftmargin=0pt, label={}, itemsep=1pt]`,
    ...rankedSkills.map(
      (skill) =>
        `  \\item \\textbf{${escapeLatex(skill.label)}:} ${escapeLatex(skill.content)}`,
    ),
    String.raw`\end{itemize}`,
    "",
    "% ---------- EXPERIENCE ----------",
    String.raw`\section{Professional Experience}`,
    ...data.experience.flatMap((job) => {
      const rankedBullets = job.bullets
        .map((bullet, originalIndex) => ({
          bullet,
          originalIndex,
          relevance: analysis.matchedSkills.filter((skill) =>
            containsResumeSkill(bullet, skill),
          ).length +
            analysis.matchedResponsibilities.filter((responsibility) =>
              responsibility.aliases.some((alias) =>
                containsTerm(bullet, alias),
              ),
            ).length,
        }))
        .sort(
          (a, b) => b.relevance - a.relevance || a.originalIndex - b.originalIndex,
        )
        .map((item) => item.bullet);
      return [
        `\\role{${escapeLatex(job.role)}}{${escapeLatex(job.employer)}}{${job.date}}{}`,
        String.raw`\begin{itemize}`,
        ...rankedBullets.map((bullet) => `  \\item ${escapeLatex(bullet)}`),
        String.raw`\end{itemize}`,
        `\\keycontrib{${escapeLatex(job.contribution)}}`,
        "",
      ];
    }),
    "% ---------- PROJECTS ----------",
    String.raw`\section{Projects}`,
    ...data.projects.flatMap((project) => {
      const rankedBullets = project.bullets
        .map((bullet, originalIndex) => ({
          bullet,
          originalIndex,
          relevance:
            analysis.matchedSkills.filter((skill) =>
              containsResumeSkill(bullet, skill),
            ).length +
            analysis.matchedResponsibilities.filter((responsibility) =>
              responsibility.aliases.some((alias) =>
                containsTerm(bullet, alias),
              ),
            ).length,
        }))
        .sort(
          (a, b) => b.relevance - a.relevance || a.originalIndex - b.originalIndex,
        )
        .map((item) => item.bullet);
      return [
        `\\role{${escapeLatex(project.name)}}{${escapeLatex(project.details)}}{}{\\href{${project.url}}{GitHub}}`,
        String.raw`\begin{itemize}`,
        ...rankedBullets.map((bullet) => `  \\item ${escapeLatex(bullet)}`),
        String.raw`\end{itemize}`,
        "",
      ];
    }),
    "% ---------- CERTIFICATIONS ----------",
    String.raw`\section{Certifications}`,
    String.raw`\begin{itemize}`,
    ...data.certifications.map((certification) => `  \\item ${escapeLatex(certification)}`),
    String.raw`\end{itemize}`,
    "",
    "% ---------- EDUCATION ----------",
    String.raw`\section{Education}`,
    ...data.education.map((education, index) =>
      index === 0
        ? `\\textbf{${escapeLatex(education)}} \\\\`
        : `\\textbf{${escapeLatex(education)}}`,
    ),
    "",
    String.raw`\end{document}`,
    "",
  ];
  return resumeLines.join("\n");
}

function readStorage(key, fallback, validator) {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return fallback;
    const value = JSON.parse(stored);
    if (validator(value)) return value;
    showToast("Saved browser data could not be read. Showing your default workspace instead.");
    return fallback;
  } catch {
    showToast("Browser storage is unavailable or invalid. Showing your default workspace instead.");
    return fallback;
  }
}

function loadProfile() {
  const saved = readStorage(
    STORAGE_KEYS.profile,
    {},
    (value) => value !== null && typeof value === "object" && !Array.isArray(value),
  );
  const skills = Array.isArray(saved.skills)
    ? saved.skills.filter((skill) => typeof skill === "string").slice(0, 30)
    : DEFAULT_PROFILE.skills;
  return {
    ...DEFAULT_PROFILE,
    ...saved,
    name: typeof saved.name === "string" ? saved.name : DEFAULT_PROFILE.name,
    linkedin:
      typeof saved.linkedin === "string"
        ? saved.linkedin
        : DEFAULT_PROFILE.linkedin,
    title: typeof saved.title === "string" ? saved.title : DEFAULT_PROFILE.title,
    location:
      typeof saved.location === "string" ? saved.location : DEFAULT_PROFILE.location,
    years: boundedNumber(saved.years, DEFAULT_PROFILE.years),
    minimumYears: boundedNumber(saved.minimumYears, DEFAULT_PROFILE.minimumYears),
    skills,
  };
}

function boundedNumber(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 40 ? number : fallback;
}

function loadJobs() {
  return readStorage(
    STORAGE_KEYS.jobs,
    [],
    (value) =>
      Array.isArray(value) &&
      value.every(
        (job) =>
          job !== null &&
          typeof job === "object" &&
          typeof job.id === "string" &&
          typeof job.title === "string" &&
          typeof job.company === "string" &&
          typeof job.createdAt === "string" &&
          isSafeListingUrl(job.url) &&
          typeof job.status === "string" &&
          STATUS_OPTIONS.includes(job.status),
      ),
  ).slice(0, 500);
}

function loadResumeVersions() {
  const saved = readStorage(
    STORAGE_KEYS.resumes,
    [],
    (value) =>
      Array.isArray(value) &&
      value.length <= 20 &&
      value.every(
        (version) =>
          version !== null &&
          typeof version === "object" &&
          typeof version.id === "string" &&
          version.id.length <= 100 &&
          typeof version.role === "string" &&
          version.role.length <= 120 &&
          typeof version.description === "string" &&
          version.description.length >= 80 &&
          version.description.length <= 30000 &&
          typeof version.latex === "string" &&
          version.latex.length <= 50000 &&
          (version.score === null ||
            (Number.isInteger(version.score) &&
              version.score >= 0 &&
              version.score <= 100)) &&
          typeof version.createdAt === "string" &&
          !Number.isNaN(Date.parse(version.createdAt)),
      ),
  );
  return saved.slice(0, 20);
}

function isSafeListingUrl(value) {
  if (typeof value !== "string") return false;
  if (value === "") return true;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

let profile = loadProfile();
let jobs = loadJobs();
let currentFilter = "all";
resumeVersions = loadResumeVersions();

function saveStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    showToast("Browser storage is full or unavailable. Your changes could not be saved.");
    return false;
  }
  return true;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return replacements[character];
  });
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 3000);
}

function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length
    ? parts
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join("")
    : "KS";
}

function formatExperience(years) {
  return `${years}+ ${years === 1 ? "year" : "years"} of experience`;
}

function renderTags(container, skills, emptyLabel = "No skills added yet") {
  container.replaceChildren();
  if (skills.length === 0) {
    const empty = document.createElement("span");
    empty.className = "tag-list-empty";
    empty.textContent = emptyLabel;
    container.append(empty);
    return;
  }
  for (const skill of skills.slice(0, 12)) {
    const tag = document.createElement("span");
    tag.className = "skill-tag";
    tag.textContent = skill;
    container.append(tag);
  }
}

function renderProfile() {
  $("#sidebar-name").textContent = profile.name.trim() || "Your profile";
  $("#sidebar-avatar").textContent = initials(profile.name);
  $("#summary-location").textContent = profile.location.trim() || "Ireland";
  $("#summary-experience").textContent = formatExperience(profile.minimumYears);
  $("#profile-card-experience").textContent = `${profile.minimumYears}+ years`;
  renderTags($("#summary-skills"), profile.skills, "Add your skills to get started");
  renderTags(
    $("#search-skill-tags"),
    profile.skills,
    "Add skills in your profile to tailor searches",
  );

  $("#profile-name").value = profile.name;
  $("#profile-linkedin").value = profile.linkedin;
  $("#profile-title").value = profile.title;
  $("#profile-location").value = profile.location;
  $("#profile-years").value = profile.years;
  $("#profile-min-years").value = profile.minimumYears;
  $("#profile-skills").value = profile.skills.join(", ");

  $("#search-role").value = profile.title;
  $("#search-location").value = profile.location;
  $("#search-years").value = profile.minimumYears;
  $("#results-location").textContent = `⌖ ${profile.location.trim() || "Ireland"}`;
}

function renderMetrics() {
  const activeJobs = jobs.filter((job) => job.status !== "Archived");
  $("#metric-total").textContent = activeJobs.length;
  $("#metric-saved").textContent = jobs.filter((job) => job.status === "Saved").length;
  $("#metric-applied").textContent = jobs.filter((job) =>
    ["Applied", "Interview", "Offer"].includes(job.status),
  ).length;
  $("#metric-interviews").textContent = jobs.filter((job) =>
    ["Interview", "Offer"].includes(job.status),
  ).length;
  $("#nav-count").textContent = activeJobs.length;
  $("#filter-all-count").textContent = activeJobs.length;
  $("#filter-saved-count").textContent = jobs.filter((job) => job.status === "Saved").length;
  $("#filter-applied-count").textContent = jobs.filter((job) => job.status === "Applied").length;
  $("#filter-interview-count").textContent = jobs.filter(
    (job) => job.status === "Interview",
  ).length;
  $("#filter-archived-count").textContent = jobs.filter(
    (job) => job.status === "Archived",
  ).length;
}

function dateLabel(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function dateTimeLabel(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function renderSavedResumes() {
  const list = $("#saved-resumes-list");
  if (!list) return;
  list.replaceChildren();
  $("#resume-version-count").textContent = `${resumeVersions.length} / 20 saved locally`;
  if (resumeVersions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "panel saved-resume-empty";
    empty.textContent = "Your saved role-specific resumes will appear here.";
    list.append(empty);
    return;
  }

  for (const version of resumeVersions) {
    const row = document.createElement("article");
    row.className = "panel saved-resume-card";
    const copy = document.createElement("div");
    copy.className = "saved-resume-copy";
    const title = document.createElement("strong");
    title.textContent = version.role || "DevOps Engineer";
    const info = document.createElement("span");
    const score =
      version.score === null ? "Match score not available" : `${version.score}% match`;
    info.textContent = `${dateTimeLabel(version.createdAt)} · ${score}`;
    const preview = document.createElement("p");
    preview.textContent = version.description.replace(/\s+/g, " ").slice(0, 170);
    copy.append(title, info, preview);

    const actions = document.createElement("div");
    actions.className = "saved-resume-actions";
    const open = document.createElement("button");
    open.className = "button button-outline";
    open.type = "button";
    open.dataset.resumeAction = "open";
    open.dataset.resumeId = version.id;
    open.textContent = "Open";
    const download = document.createElement("button");
    download.className = "button button-outline";
    download.type = "button";
    download.dataset.resumeAction = "download";
    download.dataset.resumeId = version.id;
    download.textContent = "Download .tex";
    const remove = document.createElement("button");
    remove.className = "remove-role";
    remove.type = "button";
    remove.dataset.resumeAction = "delete";
    remove.dataset.resumeId = version.id;
    remove.setAttribute("aria-label", `Delete saved resume for ${version.role}`);
    remove.textContent = "×";
    actions.append(open, download, remove);
    row.append(copy, actions);
    list.append(row);
  }
}

function renderOverview() {
  const container = $("#recent-applications");
  const latest = jobs
    .filter((job) => job.status !== "Archived")
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 3);

  container.replaceChildren();
  if (latest.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML =
      '<span class="empty-state-mark">✳</span><strong>Your next opportunity starts here.</strong><p>Search live openings, then add a role to keep your applications on track.</p>';
    container.append(empty);
    return;
  }

  const list = document.createElement("div");
  list.className = "overview-job-list";
  for (const job of latest) {
    const row = document.createElement("div");
    row.className = "overview-job-row";
    row.innerHTML = `<span class="overview-job-mark">↗</span><span class="overview-job-copy"><strong>${escapeHtml(job.title)}</strong><span>${escapeHtml(job.company || "Company not specified")}</span></span><span class="job-status ${STATUS_BADGES[job.status]}">${escapeHtml(job.status)}</span>`;
    list.append(row);
  }
  container.append(list);
}

function renderApplications() {
  renderMetrics();
  const allJobs = jobs.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const visibleJobs =
    currentFilter === "all"
      ? allJobs
      : allJobs.filter((job) => job.status === currentFilter);
  const list = $("#applications-list");
  list.replaceChildren();

  if (visibleJobs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "panel empty-applications";
    const isFiltered = currentFilter !== "all";
    empty.innerHTML = `<div class="empty-state"><span class="empty-state-mark">✳</span><strong>${isFiltered ? "Nothing in this stage just yet." : "Your next opportunity starts here."}</strong><p>${isFiltered ? "Move an application into this stage and it will appear here." : "Search live job boards, then add a role to start building your pipeline."}</p></div>`;
    list.append(empty);
    return;
  }

  for (const job of visibleJobs) {
    const row = document.createElement("article");
    row.className = "application-row";
    const title = job.url
      ? `<a href="${escapeHtml(job.url)}" target="_blank" rel="noreferrer">${escapeHtml(job.title)} ↗</a>`
      : `<strong>${escapeHtml(job.title)}</strong>`;
    row.innerHTML = `
      <div class="job-name">${title}<span>${escapeHtml(job.company || "Company not specified")}</span></div>
      <span class="job-date">${dateLabel(job.createdAt)}</span>
      <select class="status-select" aria-label="Application status for ${escapeHtml(job.title)}" data-status-id="${escapeHtml(job.id)}">
        ${STATUS_OPTIONS.map(
          (status) =>
            `<option value="${status}" ${status === job.status ? "selected" : ""}>${status}</option>`,
        )
          .join("")}
      </select>
      <button class="remove-role" type="button" data-remove-id="${escapeHtml(job.id)}" aria-label="Archive ${escapeHtml(job.title)}">×</button>`;
    list.append(row);
  }
}

function buildSearchQuery() {
  const role = $("#search-role").value.trim() || profile.title || "DevOps Engineer";
  const location = $("#search-location").value.trim() || profile.location || "Ireland";
  const years = boundedNumber(
    $("#search-years").value,
    profile.minimumYears,
  );
  const skills = profile.skills.slice(0, 6);
  const terms = [role, ...skills, `${years}+ years experience`, location];
  return { query: [...new Set(terms)].join(" "), location };
}

function renderSourceBoards() {
  const { query, location } = buildSearchQuery();
  const grid = $("#source-grid");
  grid.replaceChildren();
  for (const board of SOURCE_BOARDS) {
    const link = document.createElement("a");
    link.className = "source-card";
    link.href = board.url(query, location);
    link.target = "_blank";
    link.rel = "noreferrer";
    link.innerHTML = `<span class="source-logo ${board.key}">${escapeHtml(board.logo)}</span><span class="source-copy"><strong>${escapeHtml(board.name)}</strong><p>${escapeHtml(board.description)}</p><span class="source-meta">${escapeHtml(board.metadata || `Opens live results on ${board.name}`)}</span></span><span class="source-open" aria-hidden="true">↗</span>`;
    grid.append(link);
  }
  $("#results-location").textContent = `⌖ ${location}`;
}

function renderAll() {
  renderProfile();
  renderMetrics();
  renderOverview();
  renderApplications();
  renderSourceBoards();
  renderSavedResumes();
}

function navigateTo(pageName) {
  if (!["overview", "search", "resume", "applications", "profile"].includes(pageName)) return;
  $$(".page-section").forEach((section) => {
    section.classList.toggle("is-visible", section.id === `page-${pageName}`);
  });
  $$(".primary-nav .nav-link, .sidebar > .nav-link").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.page === pageName);
  });
  const pageTitles = {
    overview: "Overview",
    search: "Find jobs",
    resume: "Resume studio",
    applications: "My applications",
    profile: "Skills & experience",
  };
  $("#breadcrumb-current").textContent = pageTitles[pageName];
  $("#sidebar").classList.remove("is-open");
  if (pageName === "search") renderSourceBoards();
  if (pageName === "resume" && generatedLatex) {
    $("#latex-output").value = generatedLatex;
    $("#resume-output-panel").hidden = false;
  }
  if (pageName === "applications") renderApplications();
  window.history.replaceState(null, "", `#${pageName}`);
}

function persistJobs() {
  const saved = saveStorage(STORAGE_KEYS.jobs, jobs);
  if (saved) {
    renderAll();
    return true;
  }
  return false;
}

function handleProfileSave(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const minimumYears = boundedNumber(form.get("minimumYears"), profile.minimumYears);
  const years = boundedNumber(form.get("years"), profile.years);
  const rawLinkedin = String(form.get("linkedin") || "").trim();
  if (
    rawLinkedin &&
    !/^https:\/\/(www\.)?linkedin\.com\/in\/[A-Za-z0-9_%.-]+\/?$/i.test(rawLinkedin)
  ) {
    showToast("Please enter a valid LinkedIn profile URL.");
    $("#profile-linkedin").focus();
    return;
  }
  const rawSkills = String(form.get("skills") || "");
  const skills = [
    ...new Map(
      rawSkills
        .split(",")
        .map((skill) => skill.trim())
        .filter(Boolean)
        .map((skill) => [skill.toLowerCase(), skill.slice(0, 50)]),
    ).values(),
  ].slice(0, 30);

  const updated = {
    ...profile,
    name: String(form.get("name") || "").trim().slice(0, 80),
    linkedin: rawLinkedin || DEFAULT_PROFILE.linkedin,
    title: String(form.get("title") || "").trim().slice(0, 100) || "DevOps Engineer",
    location: String(form.get("location") || "").trim().slice(0, 100) || "Ireland",
    years,
    minimumYears,
    skills,
  };
  if (!saveStorage(STORAGE_KEYS.profile, updated)) return;
  profile = updated;
  renderAll();
  showToast("Your profile and search criteria are saved on this device.");
}

function handleAddJob(event) {
  event.preventDefault();
  if (jobs.length >= 500) {
    showToast("Your tracker has reached its 500-role limit. Archive a role to add another.");
    return;
  }
  const form = new FormData(event.currentTarget);
  const title = String(form.get("jobTitle") || "").trim();
  const rawUrl = String(form.get("jobUrl") || "").trim();
  let url = "";
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("Unsupported protocol");
      url = parsed.href;
    } catch {
      showToast("Please provide a valid job listing URL or leave the field blank.");
      return;
    }
  }

  const job = {
    id: crypto.randomUUID(),
    title: title.slice(0, 120),
    company: String(form.get("company") || "").trim().slice(0, 120),
    url,
    status: String(form.get("status")),
    createdAt: new Date().toISOString(),
  };
  jobs = [job, ...jobs];
  if (!persistJobs()) {
    jobs = jobs.filter((entry) => entry.id !== job.id);
    renderAll();
    return;
  }
  $("#add-job-dialog").close();
  event.currentTarget.reset();
  navigateTo("applications");
  showToast("Role added to your application pipeline.");
}

function handleExport() {
  const exportJobs = jobs.filter((job) => job.status !== "Archived");
  if (exportJobs.length === 0) {
    showToast("Add a role to your tracker before exporting your applications.");
    return;
  }
  const rows = [
    ["Job title", "Company", "Status", "Listing URL", "Added"].map(csvCell).join(","),
    ...exportJobs.map((job) =>
      [job.title, job.company, job.status, job.url, dateLabel(job.createdAt)]
        .map(csvCell)
        .join(","),
    ),
  ];
  const url = URL.createObjectURL(new Blob([`\uFEFF${rows.join("\r\n")}`], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "my-devops-applications.csv";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Your application tracker has been exported.");
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function updateDescriptionCount() {
  const length = $("#job-description").value.length;
  $("#description-count").textContent = `${length.toLocaleString("en-IE")} / 30,000`;
}

function handleGenerateResume() {
  const description = $("#job-description").value.trim();
  if (description.length < 80) {
    showToast("Paste the full job description (at least 80 characters) to get a useful match score.");
    $("#job-description").focus();
    return;
  }
  const analysis = analyseResumeMatch(description);
  const targetRole = $("#resume-target-role").value.trim().slice(0, 120);
  currentResumeAnalysis = analysis;
  currentResumeJob = targetRole;
  generatedLatex = generateResumeLatex(targetRole, analysis);
  $("#latex-output").value = generatedLatex;
  $("#resume-output-panel").hidden = false;
  renderResumeScore(analysis);
  showToast(
    analysis.score === null
      ? "LaTeX generated. No recognizable matching criteria were found to score."
      : `LaTeX generated. Estimated resume alignment: ${analysis.score}%.`,
  );
  $("#resume-output-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function copyLatex() {
  if (!generatedLatex) {
    showToast("Generate your resume before copying the LaTeX source.");
    return;
  }
  try {
    await navigator.clipboard.writeText(generatedLatex);
    showToast("Overleaf LaTeX source copied to your clipboard.");
  } catch {
    showToast("Clipboard access was denied. Select and copy the LaTeX from the source box.");
  }
}

function downloadLatex() {
  if (!generatedLatex) {
    showToast("Generate your resume before downloading the LaTeX source.");
    return;
  }
  downloadResumeLatex(generatedLatex, currentResumeJob);
  showToast("Overleaf-ready .tex file downloaded.");
}

function downloadResumeLatex(latex, role) {
  const blobUrl = URL.createObjectURL(
    new Blob([latex], { type: "application/x-tex;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  const filenameRole = String(role || "devops-resume")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 45);
  anchor.download = `kiran-${filenameRole || "devops-resume"}.tex`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

function saveResumeVersion() {
  if (!generatedLatex || !currentResumeAnalysis) {
    showToast("Generate a tailored resume before saving a version.");
    return;
  }
  if (resumeVersions.length >= 20) {
    showToast("You’ve reached the 20-version limit. Delete a saved version before adding another.");
    return;
  }
  const version = {
    id: crypto.randomUUID(),
    role: currentResumeJob || "DevOps Engineer",
    description: $("#job-description").value.trim(),
    latex: generatedLatex,
    score: currentResumeAnalysis.score,
    createdAt: new Date().toISOString(),
  };
  const nextVersions = [version, ...resumeVersions];
  if (!saveStorage(STORAGE_KEYS.resumes, nextVersions)) return;
  resumeVersions = nextVersions;
  renderSavedResumes();
  showToast(`Saved the tailored resume for ${version.role} in this browser.`);
}

function handleResumeVersionAction(event) {
  const button = event.target.closest("[data-resume-action]");
  if (!button) return;
  const version = resumeVersions.find(
    (item) => item.id === button.dataset.resumeId,
  );
  if (!version) {
    showToast("This saved resume could not be found. Refresh the page and try again.");
    return;
  }

  if (button.dataset.resumeAction === "delete") {
    const nextVersions = resumeVersions.filter(
      (item) => item.id !== version.id,
    );
    if (!saveStorage(STORAGE_KEYS.resumes, nextVersions)) return;
    resumeVersions = nextVersions;
    renderSavedResumes();
    showToast("Saved resume version deleted from this browser.");
    return;
  }

  if (button.dataset.resumeAction === "download") {
    downloadResumeLatex(version.latex, version.role);
    showToast("Saved Overleaf-ready .tex file downloaded.");
    return;
  }

  if (button.dataset.resumeAction === "open") {
    $("#resume-target-role").value = version.role;
    $("#job-description").value = version.description;
    updateDescriptionCount();
    currentResumeJob = version.role;
    currentResumeAnalysis = analyseResumeMatch(version.description);
    generatedLatex = version.latex;
    $("#latex-output").value = version.latex;
    $("#resume-output-panel").hidden = false;
    renderResumeScore(currentResumeAnalysis);
    showToast(`Reopened the saved resume for ${version.role}.`);
    $("#resume-output-panel").scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
}

$$("[data-page]").forEach((button) => {
  button.addEventListener("click", () => navigateTo(button.dataset.page));
});

$("#mobile-menu").addEventListener("click", () => {
  $("#sidebar").classList.toggle("is-open");
});
$("#search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  profile = {
    ...profile,
    title: $("#search-role").value.trim() || "DevOps Engineer",
    location: $("#search-location").value.trim() || "Ireland",
    minimumYears: boundedNumber($("#search-years").value, profile.minimumYears),
  };
  renderSourceBoards();
  const firstBoard = $("#source-grid a");
  if (firstBoard) window.open(firstBoard.href, "_blank", "noopener,noreferrer");
});
$("#search-location").addEventListener("input", renderSourceBoards);
$("#search-role").addEventListener("input", renderSourceBoards);
$("#search-years").addEventListener("input", renderSourceBoards);
$("#edit-skills").addEventListener("click", () => navigateTo("profile"));
$("#profile-form").addEventListener("submit", handleProfileSave);
$("#job-description").addEventListener("input", updateDescriptionCount);
$("#generate-resume").addEventListener("click", handleGenerateResume);
$("#copy-latex").addEventListener("click", copyLatex);
$("#download-latex").addEventListener("click", downloadLatex);
$("#save-resume-version").addEventListener("click", saveResumeVersion);
$("#saved-resumes-list").addEventListener("click", handleResumeVersionAction);

$$(".filter-tab").forEach((button) => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    $$(".filter-tab").forEach((tab) =>
      tab.classList.toggle("is-selected", tab === button),
    );
    renderApplications();
  });
});

$("#applications-list").addEventListener("change", (event) => {
  const select = event.target.closest("[data-status-id]");
  if (!select) return;
  const job = jobs.find((entry) => entry.id === select.dataset.statusId);
  if (!job) return;
  const previousStatus = job.status;
  job.status = select.value;
  if (!persistJobs()) {
    job.status = previousStatus;
    renderAll();
  }
});

$("#applications-list").addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-id]");
  if (!removeButton) return;
  const job = jobs.find((entry) => entry.id === removeButton.dataset.removeId);
  if (!job) return;
  const previousStatus = job.status;
  job.status = "Archived";
  if (persistJobs()) {
    showToast("Role archived. It has been removed from your active pipeline.");
  } else {
    job.status = previousStatus;
    renderAll();
  }
});

$("#add-job-button").addEventListener("click", () => $("#add-job-dialog").showModal());
$("#close-dialog").addEventListener("click", () => $("#add-job-dialog").close());
$("#cancel-dialog").addEventListener("click", () => $("#add-job-dialog").close());
$("#add-job-form").addEventListener("submit", handleAddJob);
$("#export-button").addEventListener("click", handleExport);
$("#add-job-dialog").addEventListener("click", (event) => {
  if (event.target === $("#add-job-dialog")) $("#add-job-dialog").close();
});

const initialPage = window.location.hash.slice(1);
renderAll();
navigateTo(
  ["overview", "search", "resume", "applications", "profile"].includes(initialPage)
    ? initialPage
    : "overview",
);
