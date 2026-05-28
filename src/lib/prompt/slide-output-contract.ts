import "server-only";

export const SLIDE_OUTPUT_CONTRACT = `SLIDE OUTPUT CONTRACT (STRICT)

1. Output ONLY a sequence of slides. Do not emit prose, code fences, or any text outside the slide markers.
2. Each slide MUST be wrapped exactly as:
   <!--SLIDE:TYPE-->
   <section class="slide slide--TYPE" data-name="..." data-mark="...">
     ...
   </section>
   <!--/SLIDE-->
3. TYPE must be one of the slide types declared in the template's meta.json (do not invent new types).
4. Do NOT include <!DOCTYPE>, <html>, <head>, <body>, <style>, or <script> — the shell is provided by the server.
5. Do NOT use CSS custom properties or class names that are not defined in the template's shell <style>. Only use the classes shown in slides/*.html samples.
6. For images, use ONLY <img data-bank-id="img-XX" alt="..."> placeholders. Do NOT write src="". The server replaces data-bank-id with the actual image after generation.
7. Preserve the structural skeleton of slides/<TYPE>.html exactly (DOM tree, class names, data-* attributes). Only replace the human text inside.
8. The opening slide MUST be \`cover\`. The final slide MUST be \`closing\`. Optional middle slides should follow the template's scaffoldOrder hint.
9. Aim for the slide count provided by the user (slideCountHint, ±20%).
10. If an image bank entry has sourceType="page", treat it as a verbatim page capture from the source PDF — only use it when explicitly relevant.
`;
