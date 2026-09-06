interface MermaidBlockProps {
  definition: string
}

// Placeholder stub — Task 3 replaces this with real mermaid rendering behind
// the same {definition} prop contract. It exists here only so MarkdownView's
// mermaid-detection tests can compile and pass independently of Task 3. The
// definition is stashed on a data attribute (rather than left unused) so
// this repo's no-unused-vars lint rule stays clean without an underscore-
// prefix exemption this config doesn't grant.
export function MermaidBlock({ definition }: MermaidBlockProps) {
  return <div data-testid="mermaid-block" data-definition={definition} />
}
