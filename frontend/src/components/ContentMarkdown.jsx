import React, { useMemo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { Link } from "react-router-dom";
import { InlineLegalLink } from "./LegalLinks";

// The ONLY renderer for admin-authored content (Phase 4b §6). Everyone,
// including logged-out visitors, sees this text, so it's a stored-XSS
// surface:
//   - no raw HTML: skipHtml, no rehype-raw, never dangerouslySetInnerHTML;
//   - links: relative "/…" → router Link, https:/mailto: → external with
//     rel="noopener noreferrer", anything else (javascript:, data:, …) →
//     plain text (react-markdown's default urlTransform also blanks those);
//   - images are never rendered (no tracking pixels, CSP unchanged).
//
// variant="page" renders blocks (legal pages, the gate's notice text);
// variant="inline" renders paragraphs as spans, for banners and labels.

const EXPLICIT_ID = /\s+\{#([a-z0-9][a-z0-9-]*)\}\s*$/;

// "## Monitoring and logging {#monitoring}" → <h2 id="monitoring">, so
// anchors other screens link to survive a heading rename. rehype-slug skips
// headings that already have an id. backend services/content.ts's
// headingIds() mirrors this for the required-anchor check.
function remarkHeadingIds() {
  return (tree) => {
    const walk = (node) => {
      if (node.type === "heading") {
        const last = node.children?.[node.children.length - 1];
        const m = last?.type === "text" ? last.value.match(EXPLICIT_ID) : null;
        if (m) {
          last.value = last.value.slice(0, m.index);
          node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id: m[1] } };
        }
      }
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}

// Highlights open "[TBD: …]" placeholders in draft text.
function rehypeTbd() {
  const re = /\[TBD[^\]]*\]/g;
  return (tree) => {
    const walk = (node) => {
      if (!node.children) return;
      const out = [];
      for (const child of node.children) {
        if (child.type === "text" && child.value.includes("[TBD")) {
          let last = 0;
          for (const m of child.value.matchAll(re)) {
            if (m.index > last) out.push({ type: "text", value: child.value.slice(last, m.index) });
            out.push({
              type: "element",
              tagName: "span",
              properties: { className: ["legal-tbd"] },
              children: [{ type: "text", value: m[0] }],
            });
            last = m.index + m[0].length;
          }
          if (last < child.value.length) out.push({ type: "text", value: child.value.slice(last) });
        } else {
          if (child.type === "element" && child.tagName !== "code" && child.tagName !== "pre") walk(child);
          out.push(child);
        }
      }
      node.children = out;
    };
    walk(tree);
  };
}

function SafeLink({ href = "", children, newTab }) {
  if (href.startsWith("/") && !href.startsWith("//")) {
    return newTab ? <InlineLegalLink to={href}>{children}</InlineLegalLink> : <Link to={href}>{children}</Link>;
  }
  if (href.startsWith("#") && href.length > 1) {
    return (
      <Link to={{ hash: href.slice(1) }} replace>
        {children}
      </Link>
    );
  }
  if (/^https:\/\//i.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  if (/^mailto:/i.test(href)) {
    return (
      <a href={href} rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return <span>{children}</span>;
}

const REMARK_PLUGINS = [remarkGfm, remarkHeadingIds];
const REHYPE_PLUGINS = [rehypeSlug, rehypeTbd];
const DISALLOWED = ["img"];

function buildComponents(variant, newTab) {
  const components = {
    // eslint-disable-next-line no-unused-vars
    a: ({ node, href, children }) => (
      <SafeLink href={href} newTab={newTab}>
        {children}
      </SafeLink>
    ),
    img: () => null,
    // eslint-disable-next-line no-unused-vars
    table: ({ node, ...props }) => (
      <div className="legal-table-wrap">
        <table {...props} />
      </div>
    ),
  };
  if (variant === "inline") {
    // Banners and checkbox labels sit inside <label>/<p>, which can't hold
    // block elements.
    // eslint-disable-next-line no-unused-vars
    components.p = ({ node, children }) => <span className="block [&:not(:last-child)]:mb-1">{children}</span>;
  }
  return components;
}

export default function ContentMarkdown({ children, variant = "page", newTabLinks = false, className }) {
  const newTab = newTabLinks || variant === "inline";
  const components = useMemo(() => buildComponents(variant, newTab), [variant, newTab]);
  const markdown = (
    <Markdown
      skipHtml
      disallowedElements={DISALLOWED}
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={REHYPE_PLUGINS}
      components={components}
    >
      {children || ""}
    </Markdown>
  );
  return variant === "inline" ? (
    <span className={className}>{markdown}</span>
  ) : (
    <div className={className ?? "legal-body"}>{markdown}</div>
  );
}
