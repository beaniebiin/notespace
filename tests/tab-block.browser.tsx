import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TabBlock, TabItem } from '../components/extensions/TabBlock';

interface CaseResult {
  name: string;
  status: 'passed' | 'failed';
  detail?: string;
}

const results: CaseResult[] = [];
const errors: string[] = [];

window.addEventListener('error', (e) => {
  errors.push(String((e as ErrorEvent).message || e));
});

const pass = (name: string) => results.push({ name, status: 'passed' });
const fail = (name: string, detail: string) => results.push({ name, status: 'failed', detail });

const tick = (ms = 60) => new Promise<void>((r) => setTimeout(r, ms));

const App: React.FC = () => {
  const [ready, setReady] = useState(false);
  const doneRef = useRef(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, blockquote: false, hardBreak: false }),
      TabBlock,
      TabItem,
    ],
    content: '<p>before</p>',
  });

  useEffect(() => {
    if (!editor || editor.isDestroyed || doneRef.current) return;
    doneRef.current = true;
    (async () => {
      try {
        const mount = document.getElementById('mount')!;

        // 1. insertTabBlock → 3 panels, each with a paragraph DOM
        editor.chain().focus().insertTabBlock().run();
        await tick();
        const items = () =>
          Array.from(mount.querySelectorAll('div[data-type="tab-item"]')) as HTMLElement[];
        if (items().length === 3) pass('insert creates 3 tab items');
        else fail('insert creates 3 tab items', `found ${items().length}`);
        const withP = items().filter((el) => el.querySelector('p'));
        if (withP.length === 3) pass('each panel renders a paragraph DOM');
        else fail('each panel renders a paragraph DOM', `${withP.length}/3 have <p>`);

        // 2. panels are editable (regression: missing content slot → contenteditable=false)
        const nonEditable = items().filter((el) => el.isContentEditable === false);
        if (nonEditable.length === 0) pass('panels are editable');
        else fail('panels are editable', `${nonEditable.length}/3 not editable`);

        // 3. typed (command-inserted) text matches between doc and DOM
        let paraPos = -1;
        editor.state.doc.descendants((node, pos) => {
          if (paraPos !== -1) return false;
          if (node.type.name === 'paragraph') {
            // first paragraph inside the tab block
            const $pos = editor.state.doc.resolve(pos);
            for (let d = $pos.depth; d >= 0; d--) {
              if ($pos.node(d).type.name === 'tabBlock') {
                paraPos = pos;
                return false;
              }
            }
          }
          return true;
        });
        if (paraPos === -1) {
          fail('command text matches doc and DOM', 'no paragraph inside tab block');
        } else {
          editor.chain().setTextSelection(paraPos + 1).insertContent('hello-tab').run();
          await tick();
          const inDoc = editor.state.doc.textContent.includes('hello-tab');
          const panels = mount.querySelector('.tab-panels');
          const inDom = (panels?.textContent || '').includes('hello-tab');
          if (inDoc && inDom) pass('command text matches doc and DOM');
          else fail('command text matches doc and DOM', `doc=${inDoc} dom=${inDom}`);
        }

        // 4. clicking the second tab shows only the second panel
        // (re-query DOM after every step — never reuse stale references)
        const pills = () =>
          Array.from(mount.querySelectorAll('[data-tab-pill]')) as HTMLElement[];
        if (pills().length >= 2) {
          pills()[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
          await tick();
          await tick();
          const current = items();
          const visible = current.filter(
            (el) => window.getComputedStyle(el).display !== 'none'
          );
          const secondVisible =
            visible.length === 1 &&
            visible[0].getAttribute('data-label') ===
              current[1].getAttribute('data-label');
          if (secondVisible) pass('second tab click shows only second panel');
          else
            fail(
              'second tab click shows only second panel',
              `visible=${visible.length}/${current.length}`
            );
        } else {
          fail('second tab click shows only second panel', `pills=${pills().length}`);
        }
      } catch (e: any) {
        fail('fixture crashed', String(e?.message || e));
      } finally {
        const pre = document.getElementById('result')!;
        pre.textContent = JSON.stringify({
          status: 'complete',
          total: results.length,
          results,
          errors,
        });
        setReady(true);
      }
    })();
  }, [editor]);

  return (
    <>
      <EditorContent editor={editor} />
      <span style={{ display: 'none' }}>{ready ? 'ready' : ''}</span>
    </>
  );
};

createRoot(document.getElementById('mount')!).render(<App />);
