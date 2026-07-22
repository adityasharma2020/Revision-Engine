import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, EmptyState, Icon } from "../../components/common";
import { Page, PageHeader } from "../../components/layout";
import { Routes } from "../../constants/routes";
import { subjectStyle } from "../../constants/subjects";
import { useUserData } from "../../context/UserDataContext";
import { ChapterParseError, parseChapter } from "../../services/parser";
import type { Chapter } from "../../types";
import styles from "./Import.module.css";

const TEMPLATE = `{
  "id": "my-subject-ch01",
  "subject": "History",
  "chapterNumber": 1,
  "title": "My Chapter Title",
  "prelims": [
    {
      "id": "q1",
      "statement": "Question text?",
      "options": [
        { "id": "a", "text": "Option A" },
        { "id": "b", "text": "Option B" }
      ],
      "answer": "a",
      "explanation": "Why A is correct."
    }
  ],
  "mains": []
}`;

const AI_PROMPT = `Convert my study material into one valid Revision Engine chapter JSON object.

Important content rules:
- Use only the material I provide. Do not invent facts, questions, answers, explanations, or citations.
- I confirm that I created, own, or have permission to use the supplied material.
- Return raw JSON only: no Markdown fences, introduction, comments, or trailing commas.
- Use a unique kebab-case chapter id and unique question ids across both arrays.
- Every prelims answer must exactly match one of that question's option ids.
- Keep "statement" as the complete question text for search and accessibility.
- Set "questionType" to exactly one of: "standard", "statements", "how-many", "match-pairs", "pair-evaluation", "assertion-reason", "sequence", "map-based", or "passage-based".
- Use "standard" for a direct question. Use "map-based" for map/location identification and "passage-based" for questions tied to a supplied passage; these need no special fields unless the source itself has structure.
- For "statements" and "how-many", provide "lead", "statements" (without number prefixes), and "ask".
- For "sequence", use the same list fields but preserve the source order. Do not solve or reorder the events.
- For "match-pairs", provide "lead", "pairs" as [{ "left": "List I item", "right": "List II item" }], optional "pairLeftLabel" and "pairRightLabel" headings, and "ask". Preserve source row order; do not perform the matching.
- For questions asking which displayed pairs are correctly matched, use "pair-evaluation" with the same pair fields.
- For "assertion-reason", provide "lead" when present, "assertion", "reason", and "ask".
- Omit fields belonging to other question types. Never force prose into a list or infer structure absent from the source.
- Allowed difficulty values are "easy", "medium", or "hard".
- If a field is unknown, omit optional fields instead of guessing.

Required structure:
{
  "id": "subject-topic-ch01",
  "subject": "Subject name",
  "title": "Chapter title",
  "chapterNumber": 1,
  "source": "Optional source attribution",
  "description": "Optional short summary",
  "tags": ["optional", "chapter-level", "tags"],
  "prelims": [
    {
      "id": "pre-001",
      "statement": "Complete multiple-choice question",
      "questionType": "statements",
      "lead": "Optional introduction for a statement-based question",
      "statements": ["First numbered statement", "Second numbered statement"],
      "ask": "Which of the statements given above is/are correct?",
      "options": [
        { "id": "a", "text": "Option A" },
        { "id": "b", "text": "Option B" }
      ],
      "answer": "a",
      "explanation": "Optional explanation grounded in the supplied material",
      "difficulty": "medium",
      "tags": ["topic"],
      "source": "Optional question source",
      "origin": "FYQ_Pre_1 or PYQ_Pre_2024 when known",
      "year": 2024
    }
  ],
  "mains": [
    {
      "id": "main-001",
      "question": "Complete descriptive question",
      "modelAnswer": "Optional model answer grounded in the supplied material",
      "keyPoints": ["Point one", "Point two"],
      "explanation": "Optional examiner guidance",
      "wordLimit": 250,
      "marks": 15,
      "difficulty": "medium",
      "tags": ["topic"],
      "origin": "FYQ_M.1 or PYQ_M.2024 when known",
      "year": 2024
    }
  ]
}

Question-format examples (use only the fields for the selected type):
- Match the following: "questionType": "match-pairs", "lead": "Match List I with List II:", "pairLeftLabel": "List I — Site", "pairRightLabel": "List II — State", "pairs": [{ "left": "Item 1", "right": "Item A" }], "ask": "Select the correct answer using the code below."
- Correctly matched pairs: "questionType": "pair-evaluation", "lead": "Consider the following pairs:", "pairLeftLabel": "Term", "pairRightLabel": "Description", "pairs": [{ "left": "Term as supplied", "right": "Description as supplied" }], "ask": "How many pairs given above are correctly matched?"
- Assertion and reason: "questionType": "assertion-reason", "assertion": "Assertion text", "reason": "Reason text", "ask": "Choose the correct option."
- Chronology/order: "questionType": "sequence", "lead": "Arrange the following in chronological order:", "statements": ["Event one", "Event two"], "ask": "Select the correct sequence."

Keep "prelims" and "mains" as arrays even when either is empty. Validate the final JSON and its answer-option matches before responding.

SOURCE MATERIAL:
[Paste the authorised study material here]`;

export function Import() {
  const navigate = useNavigate();
  const { userChapters, addUserChapter, removeUserChapter } = useUserData();
  const fileInput = useRef<HTMLInputElement>(null);

  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<Chapter | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(AI_PROMPT);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 2000);
    } catch {
      setPromptCopied(false);
    }
  };

  const validate = (text: string) => {
    setRaw(text);
    setParsed(null);
    setError(null);
    if (text.trim() === "") return;
    try {
      const chapter = parseChapter(JSON.parse(text));
      setParsed(chapter);
    } catch (err) {
      if (err instanceof ChapterParseError) {
        setError(`${err.message}${err.path ? ` — at ${err.path}` : ""}`);
      } else if (err instanceof SyntaxError) {
        setError(`Invalid JSON — ${err.message}`);
      } else {
        setError("Could not read this file.");
      }
    }
  };

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => validate(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  const save = () => {
    if (!parsed) return;
    const clash = userChapters.some((c) => c.id === parsed.id);
    if (
      clash &&
      !window.confirm(`A chapter with id "${parsed.id}" exists. Replace it?`)
    ) {
      return;
    }
    addUserChapter(parsed);
    navigate(Routes.chapter(parsed.id));
  };

  return (
    <Page narrow>
      <PageHeader
        eyebrow='Import'
        title='Add your own chapter'
        description="Upload or paste a chapter JSON. It's validated, saved to your library, and synced to your account."
      />

      <section className={styles.aiGuide} aria-labelledby='ai-import-title'>
        <div className={styles.guideHeader}>
          <div>
            <h2 id='ai-import-title'>Create JSON with an AI assistant</h2>
            <p>
              Claude, ChatGPT, or another capable tool can format your notes for
              import.
            </p>
          </div>
          <Button variant='secondary' size='sm' onClick={copyPrompt}>
            <Icon name={promptCopied ? "check" : "copy"} size={16} />
            {promptCopied ? "Copied" : "Copy prompt"}
          </Button>
        </div>
        <ol className={styles.steps}>
          <li>
            Copy the prompt, open your preferred AI assistant, and paste it.
          </li>
          <li>
            Replace the final placeholder with material you are authorised to
            use.
          </li>
          <li>
            Paste its raw JSON response below; the app will validate it before
            saving.
          </li>
        </ol>
        <details className={styles.promptDetails}>
          <summary>Preview the prompt and JSON format</summary>
          <pre>{AI_PROMPT}</pre>
        </details>
        <p className={styles.importNote}>
          AI output can be inaccurate. Review every question and answer,
          preserve source attribution, and never submit copyrighted or private
          material without permission.
        </p>
      </section>

      <div className={styles.importCaution} role='note'>
        <Badge tone='warning'>Note: </Badge>
        <p>
          Continue only if you understand what you are doing with the JSON.
          <br />
          Review its questions, answers, sources, and permissions before saving
          it to your library.
        </p>
      </div>

      <div className={styles.dropzone}>
        <input
          ref={fileInput}
          type='file'
          accept='application/json,.json'
          className={styles.hiddenInput}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
          }}
        />
        <div className={styles.dropInner}>
          <Icon name='plus' size={22} />
          <p>
            Choose a <code>.json</code> file, or paste below.
          </p>
          <Button
            variant='secondary'
            onClick={() => fileInput.current?.click()}
          >
            Choose file
          </Button>
        </div>
      </div>

      <label className={styles.pasteLabel}>
        <span>Or paste JSON</span>
        <button
          type='button'
          className={styles.templateBtn}
          onClick={() => validate(TEMPLATE)}
        >
          Insert template
        </button>
      </label>
      <textarea
        className={styles.textarea}
        value={raw}
        rows={12}
        spellCheck={false}
        placeholder='Paste chapter JSON here…'
        onChange={(e) => validate(e.target.value)}
      />

      {error && (
        <div className={styles.error}>
          <Icon name='close' size={16} />
          <span>{error}</span>
        </div>
      )}

      {parsed && (
        <div className={styles.preview}>
          <div className={styles.previewHead}>
            <Badge hue={subjectStyle(parsed.subject).hue}>
              {subjectStyle(parsed.subject).label}
            </Badge>
            <Icon name='check' size={18} className={styles.validIcon} />
          </div>
          <h3 className={styles.previewTitle}>{parsed.title}</h3>
          <p className={styles.previewMeta}>
            Chapter {parsed.chapterNumber} · {parsed.prelims.length} prelims ·{" "}
            {parsed.mains.length} mains
          </p>
          <Button variant='primary' onClick={save}>
            Add to library
          </Button>
        </div>
      )}

      <section className={styles.existing}>
        <h2 className={styles.existingTitle}>Your uploads</h2>
        {userChapters.length === 0 ? (
          <EmptyState
            icon='book'
            title='No uploads yet'
            description='Chapters you import appear here and in your library.'
          />
        ) : (
          <ul className={styles.list}>
            {userChapters.map((c) => (
              <li key={c.id} className={styles.item}>
                <button
                  type='button'
                  className={styles.itemMain}
                  onClick={() => navigate(Routes.chapter(c.id))}
                >
                  <span className={styles.itemTitle}>{c.title}</span>
                  <span className={styles.itemMeta}>
                    {subjectStyle(c.subject).label} · {c.prelims.length}P ·{" "}
                    {c.mains.length}M
                  </span>
                </button>
                <button
                  type='button'
                  className={styles.remove}
                  title='Remove'
                  onClick={() => {
                    if (
                      window.confirm(`Remove "${c.title}" from your library?`)
                    ) {
                      removeUserChapter(c.id);
                    }
                  }}
                >
                  <Icon name='trash' size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  );
}
