# Language

- **Reason in English.** All internal reasoning / thinking must be in English.
- **Respond in Korean by default.** Unless the user explicitly requests another
  language, write the user-facing output in Korean.
- **Don't pepper Korean with needless English.** Default to the natural Korean
  word. Keep a term in English only when translating it would be *more* confusing
  — established technical jargon, API / identifier / code names, or words with no
  clean Korean equivalent. Don't reach for English where a normal Korean word
  exists.
- **No stray foreign characters — strictly.** Never let Japanese kana, Chinese
  characters (漢字/汉字), or any other script leak into a word or sentence. Korean
  output is Hangul plus only the necessary Latin technical terms; a single word
  must never mix in characters from another language.
- **Don't transliterate English into Hangul; keep untranslatable terms in
  their original Latin spelling.** When a term has no clean Korean
  equivalent, write it in Latin (`scheduler`, `rebalancing`), never as an
  ad-hoc Hangul phonetic spelling (`스케줄러`, `리밸런싱`) — a transliteration
  is neither searchable English nor real Korean, and the phonetics are easy
  to get wrong. Exception: words already established as dictionary-level
  loanwords in normal Korean (`컴퓨터`, `서버`, `데이터`, `버그`) — those are
  genuine Korean; use them.
- **Pick Korean particles by the term's spoken sound, and add a Korean head
  noun when it still reads awkwardly.** Choose 을/를, 이/가, 으로/로 by how the
  English word is actually pronounced in Korean (its last syllable's final
  sound), e.g. `list를`, `head는`. When direct attachment reads awkwardly or
  is ambiguous, insert a Korean category noun after the term and attach the
  particle to that — `merge 작업을`, `head 값이`, `scheduler 항목으로`. This
  removes the 받침 ambiguity and reads naturally.
