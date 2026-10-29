const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="Haven Clinic Booking API reference" />
    <title>Haven Clinic Booking API Reference</title>
    <link rel="icon" href="/favicon.svg" />
    <style>
      html, body { margin: 0; min-height: 100%; background: #fff; }
      .back-link {
        position: fixed;
        top: 14px;
        right: 18px;
        z-index: 20;
        border: 1px solid #d8e4dd;
        border-radius: 999px;
        background: rgba(255,255,255,.94);
        color: #0f6a51;
        padding: 9px 14px;
        font: 600 13px/1.2 system-ui, sans-serif;
        text-decoration: none;
        box-shadow: 0 8px 24px rgba(22,63,53,.1);
        backdrop-filter: blur(10px);
      }
      .back-link:hover { background: #edf7f2; }
      @media (max-width: 700px) {
        .back-link { top: 8px; right: 8px; padding: 7px 10px; }
      }
    </style>
  </head>
  <body>
    <a class="back-link" href="/">Book an appointment</a>
    <redoc
      spec-url="/openapi.json"
      sort-required-props-first="true"
      schema-definitions-tag-name="Schemas"
      json-samples-expand-level="2"
      generated-samples-max-depth="4"
      disable-telemetry="true"
    ></redoc>
    <script type="module" src="https://cdn.redoc.ly/redoc/v3.0.1/bundles/redoc.standalone.js"></script>
  </body>
</html>`;

export function GET() {
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}
