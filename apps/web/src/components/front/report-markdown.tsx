import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Text-first markdown body for the ported reports (docs/front-door-plan.md
 * §7). Phase A rule: images are NOT rendered — the 21MB of report imagery
 * waits for Phase B's AVIF asset diet, so a 2G reader pays for words only.
 * GFM tables scroll inside the wrapper instead of breaking the page.
 */
export function ReportMarkdown({ content }: { content: string }) {
  return (
    <div className="xidig-report-body">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: () => null,
          a: ({ href, children }) => (
            <a href={href} rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
