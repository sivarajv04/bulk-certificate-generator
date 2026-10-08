// CERTGEN - Bulk Certificate Generator
// Main single-page React application

import React, { useEffect, useMemo, useState } from "react";

import { createRoot } from "react-dom/client";

import "./styles.css";



const API = (

  import.meta.env.VITE_API_BASE_URL ||

  "http://127.0.0.1:8000/api/v1"

).replace(/\/$/, "");



const API_ROOT = API.endsWith("/api/v1")

  ? API.slice(0, -7)

  : API;



const blankRecipient = () => ({

  name: "",

  email: "",

});



function App() {

  // ------------------------------------------------------------

  // STATE

  // ------------------------------------------------------------



  const [mode, setMode] = useState("upload");



  const [form, setForm] = useState({

    title: "Certificate of Participation",

    event_name: "",

    issuer: "",

    issue_date: new Date().toISOString().slice(0, 10),

  });



  // Manual recipients

  const [recipients, setRecipients] = useState([

    blankRecipient(),

  ]);



  // CSV / Excel

  const [file, setFile] = useState(null);

  const [preview, setPreview] = useState(null);

  const [nameColumn, setNameColumn] = useState("");

  const [emailColumn, setEmailColumn] = useState("");



  const [previewLoading, setPreviewLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);



  // Job

  const [job, setJob] = useState(null);

  const [details, setDetails] = useState(null);



  const [error, setError] = useState("");



  // ------------------------------------------------------------

  // DERIVED STATE

  // ------------------------------------------------------------



  const uploadValid = preview?.valid_count || 0;



  const manualRecipients = useMemo(() => {

    return recipients

      .filter((recipient) => recipient.name.trim())

      .map((recipient) => ({

        name: recipient.name.trim(),

        ...(recipient.email.trim()

          ? { email: recipient.email.trim() }

          : {}),

      }));

  }, [recipients]);



  const manualValid = manualRecipients.length;



  const activeCount =

    mode === "upload"

      ? uploadValid

      : manualValid;



  const finished =

    details &&

    ["COMPLETED", "COMPLETED_WITH_ERRORS", "FAILED"].includes(

      details.status

    );



  /*

   * IMPORTANT FIX:

   *

   * previewLoading should only disable the button in upload mode.

   * Previously it could disable the manual Generate button.

   */

  const generateDisabled =

    submitting ||

    (mode === "upload" && previewLoading) ||

    activeCount === 0 ||

    (mode === "upload" && !preview);



  // ------------------------------------------------------------

  // JOB POLLING

  // ------------------------------------------------------------



  useEffect(() => {

    if (!job?.job_id || finished) {

      return;

    }



    let cancelled = false;



    const poll = async () => {

      try {

        const response = await fetch(

          `${API}/certificate-jobs/${job.job_id}`

        );



        if (!response.ok) {

          throw new Error(

            `Status request failed (${response.status})`

          );

        }



        const data = await response.json();



        if (!cancelled) {

          setDetails(data);

        }

      } catch (e) {

        if (!cancelled) {

          setError(e.message);

        }

      }

    };



    poll();



    const timer = setInterval(poll, 1200);



    return () => {

      cancelled = true;

      clearInterval(timer);

    };

  }, [job?.job_id, finished]);



  // ------------------------------------------------------------

  // FORM HANDLERS

  // ------------------------------------------------------------



  function updateForm(event) {

    setForm((current) => ({

      ...current,

      [event.target.name]: event.target.value,

    }));

  }



  function updateRecipient(index, field, value) {

    setRecipients((current) =>

      current.map((recipient, i) =>

        i === index

          ? {

              ...recipient,

              [field]: value,

            }

          : recipient

      )

    );

  }



  function addRecipient() {

    setRecipients((current) => [

      ...current,

      blankRecipient(),

    ]);

  }



  function removeRecipient(index) {

    setRecipients((current) => {

      if (current.length === 1) {

        return [blankRecipient()];

      }



      return current.filter(

        (_, i) => i !== index

      );

    });

  }



  // ------------------------------------------------------------

  // MODE SWITCHING

  // ------------------------------------------------------------



  function switchMode(nextMode) {

    setError("");



    setMode(nextMode);



    /*

     * If switching to manual mode, CSV preview state should

     * not affect the manual Generate button.

     */

    if (nextMode === "manual") {

      setPreviewLoading(false);

    }



    /*

     * If switching to upload mode, keep the existing file if

     * there is one, otherwise show the upload interface.

     */

    if (nextMode === "upload") {

      setError("");

    }

  }



  // ------------------------------------------------------------

  // RESET

  // ------------------------------------------------------------



  function resetAll() {

    setJob(null);

    setDetails(null);

    setError("");



    setFile(null);

    setPreview(null);



    setNameColumn("");

    setEmailColumn("");



    setRecipients([blankRecipient()]);



    setPreviewLoading(false);

    setSubmitting(false);



    setMode("upload");

  }



  // ------------------------------------------------------------

  // CSV / EXCEL PREVIEW

  // ------------------------------------------------------------



  async function previewFile(

    nextFile,

    nextNameColumn = "",

    nextEmailColumn = ""

  ) {

    if (!nextFile) {

      return;

    }



    setError("");

    setPreview(null);

    setPreviewLoading(true);



    try {

      const data = new FormData();



      data.append("file", nextFile);



      if (nextNameColumn !== "") {

        data.append(

          "name_column",

          nextNameColumn

        );

      }



      if (nextEmailColumn !== "") {

        data.append(

          "email_column",

          nextEmailColumn

        );

      }



      const response = await fetch(

        `${API}/certificate-jobs/import-preview`,

        {

          method: "POST",

          body: data,

        }

      );



      let body;



      try {

        body = await response.json();

      } catch {

        body = {};

      }



      if (!response.ok) {

        throw new Error(

          body.detail ||

            `Could not read the file (${response.status}).`

        );

      }



      setPreview(body);



      setNameColumn(

        body.name_column == null

          ? ""

          : String(body.name_column)

      );



      setEmailColumn(

        body.email_column == null

          ? "-1"

          : String(body.email_column)

      );

    } catch (e) {

      console.error("File preview error:", e);



      setPreview(null);



      setError(

        e.message ||

          "Could not read the uploaded file."

      );

    } finally {

      setPreviewLoading(false);

    }

  }



  function onFileChange(event) {

    const nextFile =

      event.target.files?.[0];



    setFile(nextFile || null);

    setPreview(null);

    setError("");



    if (!nextFile) {

      return;

    }



    previewFile(nextFile);

  }



  function onMappingChange(type, value) {

    const nextName =

      type === "name"

        ? value

        : nameColumn;



    const nextEmail =

      type === "email"

        ? value

        : emailColumn;



    if (type === "name") {

      setNameColumn(value);

    } else {

      setEmailColumn(value);

    }



    if (

      file &&

      nextName !== ""

    ) {

      previewFile(

        file,

        nextName,

        nextEmail

      );

    }

  }



  // ------------------------------------------------------------

  // SUBMIT JOB

  // ------------------------------------------------------------



  async function submit(event) {

    event.preventDefault();



    setError("");

    setJob(null);

    setDetails(null);



    // ----------------------------------------

    // Validate certificate details

    // ----------------------------------------



    if (!form.title.trim()) {

      setError(

        "Enter a certificate title."

      );

      return;

    }



    if (!form.event_name.trim()) {

      setError(

        "Enter the event name."

      );

      return;

    }



    if (!form.issuer.trim()) {

      setError(

        "Enter the issuer."

      );

      return;

    }



    if (!form.issue_date) {

      setError(

        "Select the issue date."

      );

      return;

    }



    // ----------------------------------------

    // Get recipients

    // ----------------------------------------



    let list = [];



    if (mode === "upload") {

      list = preview?.recipients || [];

    } else {

      list = manualRecipients;

    }



    if (!list.length) {

      setError(

        "Add at least one valid recipient."

      );

      return;

    }



    // ----------------------------------------

    // Submit

    // ----------------------------------------



    setSubmitting(true);



    try {

      const response = await fetch(

        `${API}/certificate-jobs`,

        {

          method: "POST",

          headers: {

            "Content-Type":

              "application/json",

          },

          body: JSON.stringify({

            ...form,

            recipients: list,

          }),

        }

      );



      let body;



      try {

        body = await response.json();

      } catch {

        body = {};

      }



      if (!response.ok) {

        throw new Error(

          body.detail ||

            `Could not create the certificate job (${response.status}).`

        );

      }



      setJob(body);

      setDetails(body);

    } catch (e) {

      console.error(

        "Certificate generation error:",

        e

      );



      setError(

        e.message ||

          "Could not create the certificate job."

      );

    } finally {

      setSubmitting(false);

    }

  }



  // ------------------------------------------------------------

  // DOWNLOAD

  // ------------------------------------------------------------



  const statusLabel =

    details?.status ||

    job?.status ||

    "";



  const downloadUrl =

    details?.download_all_url

      ? `${API_ROOT}${details.download_all_url}`

      : null;



  // ------------------------------------------------------------

  // UI

  // ------------------------------------------------------------



  return (

    <main className="page">



      {/* HERO */}



      <header className="hero">

        <div className="eyebrow">

          CERTGEN

        </div>



        <h1>

          Bulk Certificate Generator

        </h1>



        <p>

          Turn a school, college or event

          participant list into a batch of

          ready-to-download certificates.

        </p>

      </header>



      {/* MAIN CARD */}



      <section className="card">



        {!job ? (



          <form onSubmit={submit}>



            {/* CERTIFICATE DETAILS */}



            <div className="section-title">

              1. Certificate details

            </div>



            <div className="grid">



              <label>

                Certificate title



                <input

                  name="title"

                  value={form.title}

                  onChange={updateForm}

                  placeholder="Certificate of Participation"

                  required

                />

              </label>



              <label>

                Event name



                <input

                  name="event_name"

                  value={form.event_name}

                  onChange={updateForm}

                  placeholder="Python Backend Workshop 2026"

                  required

                />

              </label>



              <label>

                Issuer



                <input

                  name="issuer"

                  value={form.issuer}

                  onChange={updateForm}

                  placeholder="Academy Name"

                  required

                />

              </label>



              <label>

                Issue date



                <input

                  type="date"

                  name="issue_date"

                  value={form.issue_date}

                  onChange={updateForm}

                  required

                />

              </label>



            </div>



            {/* RECIPIENTS */}



            <div className="section-title source-title">

              2. Add recipients

            </div>



            {/* TABS */}



            <div className="tabs">



              <button

                type="button"

                className={

                  mode === "upload"

                    ? "tab active"

                    : "tab"

                }

                onClick={() =>

                  switchMode("upload")

                }

              >

                Upload CSV / Excel

              </button>



              <button

                type="button"

                className={

                  mode === "manual"

                    ? "tab active"

                    : "tab"

                }

                onClick={() =>

                  switchMode("manual")

                }

              >

                Enter manually

              </button>



            </div>



            {/* UPLOAD MODE */}



            {mode === "upload" ? (



              <div>



                <label className="dropzone">



                  <input

                    type="file"

                    accept=".csv,.xlsx,.xlsm"

                    onChange={onFileChange}

                  />



                  <span className="upload-icon">

                    ↑

                  </span>



                  <strong>

                    {file

                      ? file.name

                      : "Choose a CSV or Excel file"}

                  </strong>



                  <span>

                    CSV, XLSX or XLSM ·

                    maximum 5 MB ·

                    up to 1000 recipients

                  </span>



                </label>



                {/* LOADING */}



                {previewLoading && (

                  <div className="loading">

                    Reading your file...

                  </div>

                )}



                {/* PREVIEW */}



                {preview && (



                  <div className="import-panel">



                    {/* SUMMARY */}



                    <div className="import-summary">



                      <div>

                        <strong>

                          {preview.valid_count}

                        </strong>



                        <span>

                          valid

                        </span>

                      </div>



                      <div>

                        <strong>

                          {preview.invalid_count}

                        </strong>



                        <span>

                          invalid

                        </span>

                      </div>



                      <div>

                        <strong>

                          {preview.duplicate_count}

                        </strong>



                        <span>

                          duplicates

                        </span>

                      </div>



                    </div>



                    {/* COLUMN MAPPING */}



                    <div className="mapping">



                      <label>

                        Name column



                        <select

                          value={nameColumn}

                          onChange={(event) =>

                            onMappingChange(

                              "name",

                              event.target.value

                            )

                          }

                        >



                          <option value="">

                            Select name column

                          </option>



                          {preview.columns.map(

                            (column) => (

                              <option

                                key={column.index}

                                value={column.index}

                              >

                                {column.name}

                              </option>

                            )

                          )}



                        </select>



                      </label>



                      <label>

                        Email column{" "}

                        <span className="optional">

                          optional

                        </span>



                        <select

                          value={emailColumn}

                          onChange={(event) =>

                            onMappingChange(

                              "email",

                              event.target.value

                            )

                          }

                        >



                          <option value="-1">

                            No email column

                          </option>



                          {preview.columns.map(

                            (column) => (

                              <option

                                key={column.index}

                                value={column.index}

                              >

                                {column.name}

                              </option>

                            )

                          )}



                        </select>



                      </label>



                    </div>



                    {/* PREVIEW TABLE */}



                    <div className="preview-header">



                      <span>

                        Preview

                      </span>



                      <small>

                        {preview.total_rows}

                        {" "}

                        data rows detected

                      </small>



                    </div>



                    <div className="table-wrap">



                      <table>



                        <thead>

                          <tr>

                            <th>Row</th>

                            <th>Status</th>

                            <th>Name</th>

                            <th>Email</th>

                            <th>Issue</th>

                          </tr>

                        </thead>



                        <tbody>



                          {preview.rows.map(

                            (row) => (



                              <tr

                                key={

                                  row.row_number

                                }

                              >



                                <td>

                                  {row.row_number}

                                </td>



                                <td>

                                  <span

                                    className={

                                      row.valid

                                        ? "pill ok"

                                        : "pill bad"

                                    }

                                  >

                                    {row.valid

                                      ? "Valid"

                                      : "Invalid"}

                                  </span>

                                </td>



                                <td>

                                  {row.name || "—"}

                                </td>



                                <td>

                                  {row.email || "—"}

                                </td>



                                <td>

                                  {row.error ||

                                    (row.duplicate

                                      ? "Duplicate name"

                                      : "—")}

                                </td>



                              </tr>



                            )

                          )}



                        </tbody>



                      </table>



                    </div>



                    {/* WARNING */}



                    {preview.invalid_count > 0 && (

                      <div className="warning">

                        Invalid rows will be skipped.

                        Only the{" "}

                        {preview.valid_count}{" "}

                        valid recipients will

                        be submitted.

                      </div>

                    )}



                  </div>



                )}



              </div>



            ) : (



              /* MANUAL MODE */



              <div>



                <div className="recipient-heading">



                  <span>

                    {manualValid} ready

                  </span>



                  <button

                    type="button"

                    className="secondary"

                    onClick={addRecipient}

                  >

                    + Add recipient

                  </button>



                </div>



                <div className="recipient-list">



                  {recipients.map(

                    (recipient, index) => (



                      <div

                        className="recipient"

                        key={index}

                      >



                        <span className="number">

                          {index + 1}

                        </span>



                        <input

                          value={

                            recipient.name

                          }

                          onChange={(event) =>

                            updateRecipient(

                              index,

                              "name",

                              event.target.value

                            )

                          }

                          placeholder="Recipient name"

                        />



                        <input

                          value={

                            recipient.email

                          }

                          onChange={(event) =>

                            updateRecipient(

                              index,

                              "email",

                              event.target.value

                            )

                          }

                          placeholder="Email (optional)"

                          type="email"

                        />



                        <button

                          type="button"

                          className="icon"

                          onClick={() =>

                            removeRecipient(index)

                          }

                          aria-label="Remove recipient"

                        >

                          ×

                        </button>



                      </div>



                    )

                  )}



                </div>



              </div>



            )}



            {/* ERROR */}



            {error && (

              <div

                className="error"

                role="alert"

              >

                {error}

              </div>

            )}



            {/* GENERATE BUTTON */}



            <button

              type="submit"

              className="primary"

              disabled={generateDisabled}

            >



              {submitting

                ? "Submitting..."

                : activeCount > 0

                ? `Generate ${activeCount} certificate${

                    activeCount === 1

                      ? ""

                      : "s"

                  }`

                : "Generate certificates"}



            </button>



          </form>



        ) : (



          /* JOB RESULT */



          <div>



            <div className="result-head">



              <div>



                <div className="section-title">

                  Generation job

                </div>



                <h2>

                  {form.event_name}

                </h2>



                <p className="muted">

                  Job ID:{" "}

                  <code>

                    {job.job_id}

                  </code>

                </p>



              </div>



              <span

                className={`status ${String(

                  statusLabel

                ).toLowerCase()}`}

              >

                {statusLabel}

              </span>



            </div>



            {/* PROGRESS */}



            <div className="progress-wrap">



              <div className="progress-label">



                <span>

                  Progress

                </span>



                <strong>

                  {Math.round(

                    details?.progress_percent ?? 0

                  )}

                  %

                </strong>



              </div>



              <div className="progress">



                <span

                  style={{

                    width: `${

                      details?.progress_percent ?? 0

                    }%`,

                  }}

                />



              </div>



              <div className="stats">



                <span>

                  ✓{" "}

                  {details?.success_count ?? 0}

                  {" "}

                  successful

                </span>



                <span>

                  •{" "}

                  {details?.pending_count ?? 0}

                  {" "}

                  pending

                </span>



                <span>

                  •{" "}

                  {details?.failed_count ?? 0}

                  {" "}

                  failed

                </span>



              </div>



            </div>



            {/* DOWNLOAD */}



            {downloadUrl && (



              <a

                className="primary download"

                href={downloadUrl}

                download

              >

                Download all certificates (ZIP)

              </a>



            )}



            {/* NEW JOB */}



            {finished && (



              <button

                type="button"

                className="secondary full"

                onClick={resetAll}

              >

                Create another batch

              </button>



            )}



          </div>



        )}



      </section>

    {/* =========================================================
        ENGINEERING & IMPROVEMENTS
    ========================================================= */}

    <section className="engineering-page">

      <div className="engineering-hero">
        <div>
          <span className="engineering-eyebrow">
            ENGINEERING &amp; IMPROVEMENTS
          </span>
          <h2>
            From backend assignment
            <br />
            to usable product.
          </h2>
          <p>
            I didn't stop at implementing the required API. I built a complete
            user-facing workflow around the backend so an organization can
            import participant data, validate it, generate certificates in
            bulk, monitor processing and retrieve the final output.
          </p>
        </div>

        <div className="engineering-summary">
          <div><strong>8+</strong><span>Major improvements</span></div>
          <div><strong>3</strong><span>Spreadsheet formats</span></div>
          <div><strong>1000</strong><span>Recipients per batch</span></div>
        </div>
      </div>

      <section className="engineering-section">
        <div className="section-heading">
          <span>WHAT I ADDED</span>
          <h3>Beyond the minimum backend requirement</h3>
          <p>
            Improvements focused on automation, data quality, reliability and usability.
          </p>
        </div>

        <div className="improvement-grid">
          <article className="improvement-card">
            <div className="improvement-top">
              <span className="improvement-number">01</span>
              <span className="improvement-tag">INPUT AUTOMATION</span>
            </div>
            <h4>CSV &amp; Excel ingestion</h4>
            <p>Added a practical spreadsheet workflow supporting CSV, XLSX and XLSM participant files.</p>
            <ul>
              <li>✓ Drag-and-drop file upload</li>
              <li>✓ Name and email column mapping</li>
              <li>✓ Automatic spreadsheet preview</li>
              <li>✓ Bulk participant processing</li>
            </ul>
          </article>

          <article className="improvement-card">
            <div className="improvement-top">
              <span className="improvement-number">02</span>
              <span className="improvement-tag">DATA QUALITY</span>
            </div>
            <h4>Pre-flight validation</h4>
            <p>Added validation before generation so users can inspect participant data before submitting a job.</p>
            <ul>
              <li>✓ Valid recipient count</li>
              <li>✓ Invalid row detection</li>
              <li>✓ Duplicate detection</li>
              <li>✓ Row-level validation feedback</li>
            </ul>
          </article>

          <article className="improvement-card">
            <div className="improvement-top">
              <span className="improvement-number">03</span>
              <span className="improvement-tag">ASYNCHRONOUS PROCESSING</span>
            </div>
            <h4>Background job processing</h4>
            <p>Certificate generation runs as a bulk job instead of making the user wait for every certificate.</p>
            <ul>
              <li>✓ Single bulk generation request</li>
              <li>✓ Job ID returned immediately</li>
              <li>✓ Automatic status polling</li>
              <li>✓ Live progress percentage</li>
            </ul>
          </article>

          <article className="improvement-card">
            <div className="improvement-top">
              <span className="improvement-number">04</span>
              <span className="improvement-tag">RELIABILITY</span>
            </div>
            <h4>Failure-aware processing</h4>
            <p>The workflow exposes successful, pending and failed generations separately.</p>
            <ul>
              <li>✓ Successful certificate count</li>
              <li>✓ Pending certificate count</li>
              <li>✓ Failed certificate count</li>
              <li>✓ Batch completion status</li>
            </ul>
          </article>

          <article className="improvement-card">
            <div className="improvement-top">
              <span className="improvement-number">05</span>
              <span className="improvement-tag">USER EXPERIENCE</span>
            </div>
            <h4>One-click batch delivery</h4>
            <p>Generated certificates are grouped into a batch and delivered through a single ZIP download.</p>
            <ul>
              <li>✓ Batch certificate grouping</li>
              <li>✓ Single download action</li>
              <li>✓ Clear completion state</li>
              <li>✓ Create another batch</li>
            </ul>
          </article>

          <article className="improvement-card">
            <div className="improvement-top">
              <span className="improvement-number">06</span>
              <span className="improvement-tag">DEPLOYMENT</span>
            </div>
            <h4>Deployment-ready configuration</h4>
            <p>The frontend API endpoint is environment-driven, allowing the same React application to work locally and with a deployed FastAPI service.</p>
            <ul>
              <li>✓ VITE_API_BASE_URL</li>
              <li>✓ Local development support</li>
              <li>✓ Cloud deployment support</li>
              <li>✓ Environment-based configuration</li>
            </ul>
          </article>

          <article className="improvement-card">
            <div className="improvement-top">
              <span className="improvement-number">07</span>
              <span className="improvement-tag">OBSERVABILITY</span>
            </div>
            <h4>Operational visibility</h4>
            <p>Added backend health visibility so users can understand whether the API is reachable.</p>
            <ul>
              <li>✓ Backend availability indicator</li>
              <li>✓ Automatic health checks</li>
              <li>✓ Clear offline state</li>
              <li>✓ Easier troubleshooting</li>
            </ul>
          </article>

          <article className="improvement-card">
            <div className="improvement-top">
              <span className="improvement-number">08</span>
              <span className="improvement-tag">FRONTEND ENGINEERING</span>
            </div>
            <h4>Complete user-facing workflow</h4>
            <p>Converted the backend assignment into an actual application instead of requiring users to interact through Swagger or raw API requests.</p>
            <ul>
              <li>✓ Responsive interface</li>
              <li>✓ Loading states</li>
              <li>✓ Validation messages</li>
              <li>✓ Progress and completion states</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="engineering-section">
        <div className="section-heading">
          <span>SYSTEM DESIGN</span>
          <h3>How the application works</h3>
          <p>The frontend acts as a workflow layer over the bulk-processing backend.</p>
        </div>

        <div className="architecture-grid">
          <div className="architecture-card"><span>01</span><div><strong>React + Vite</strong><p>User interface and workflow orchestration</p></div></div>
          <div className="architecture-card"><span>02</span><div><strong>FastAPI</strong><p>REST API and bulk job management</p></div></div>
          <div className="architecture-card"><span>03</span><div><strong>Background Processor</strong><p>Certificate generation without blocking the request</p></div></div>
          <div className="architecture-card"><span>04</span><div><strong>Relational Database</strong><p>Job and generation state persistence</p></div></div>
          <div className="architecture-card"><span>05</span><div><strong>ReportLab</strong><p>PDF certificate generation</p></div></div>
          <div className="architecture-card"><span>06</span><div><strong>ZIP Delivery</strong><p>Batch retrieval for generated certificates</p></div></div>
        </div>
      </section>

      <section className="engineering-section">
        <div className="engineering-story">
          <div>
            <span className="engineering-eyebrow">DESIGN DECISION</span>
            <h3>Why bulk processing?</h3>
            <p>
              A certificate system should not require a separate API request for every participant.
              The application accepts a recipient list as one generation job, validates the data,
              processes certificates in the background and exposes progress through job status.
            </p>
          </div>

          <div className="flow">
            <div><span>01</span><strong>Import</strong></div>
            <i>→</i>
            <div><span>02</span><strong>Validate</strong></div>
            <i>→</i>
            <div><span>03</span><strong>Generate</strong></div>
            <i>→</i>
            <div><span>04</span><strong>Monitor</strong></div>
            <i>→</i>
            <div><span>05</span><strong>Download</strong></div>
          </div>
        </div>
      </section>

      <section className="engineering-section">
        <div className="section-heading">
          <span>PROJECT VALUE</span>
          <h3>What this demonstrates</h3>
        </div>

        <div className="value-grid">
          <div><strong>Backend Engineering</strong><p>REST APIs, validation, persistence and background processing.</p></div>
          <div><strong>Frontend Engineering</strong><p>React state management, API integration and asynchronous UX.</p></div>
          <div><strong>Data Engineering</strong><p>Spreadsheet ingestion, column mapping and data-quality checks.</p></div>
          <div><strong>Production Thinking</strong><p>Environment configuration, health visibility, failure states and deployment-oriented architecture.</p></div>
        </div>
      </section>

    </section>






      <footer>

        FastAPI · React · ReportLab ·

        CSV / Excel import

      </footer>



    </main>

  );

}



createRoot(

  document.getElementById("root")

).render(

  <App />

);






// import React, { useEffect, useMemo, useState } from "react";
// import { createRoot } from "react-dom/client";
// import "./styles.css";

// const API = (
//   import.meta.env.VITE_API_BASE_URL ||
//   "http://127.0.0.1:8000/api/v1"
// ).replace(/\/$/, "");

// const API_ROOT = API.endsWith("/api/v1")
//   ? API.slice(0, -7)
//   : API;

// const blankRecipient = () => ({
//   name: "",
//   email: "",
// });

// function App() {
//   // ------------------------------------------------------------
//   // STATE
//   // ------------------------------------------------------------

//   const [mode, setMode] = useState("upload");

//   const [form, setForm] = useState({
//     title: "Certificate of Participation",
//     event_name: "",
//     issuer: "",
//     issue_date: new Date().toISOString().slice(0, 10),
//   });

//   // Manual recipients
//   const [recipients, setRecipients] = useState([
//     blankRecipient(),
//   ]);

//   // CSV / Excel
//   const [file, setFile] = useState(null);
//   const [preview, setPreview] = useState(null);
//   const [nameColumn, setNameColumn] = useState("");
//   const [emailColumn, setEmailColumn] = useState("");

//   const [previewLoading, setPreviewLoading] = useState(false);
//   const [submitting, setSubmitting] = useState(false);

//   // Job
//   const [job, setJob] = useState(null);
//   const [details, setDetails] = useState(null);

//   const [error, setError] = useState("");

//   // ------------------------------------------------------------
//   // DERIVED STATE
//   // ------------------------------------------------------------

//   const uploadValid = preview?.valid_count || 0;

//   const manualRecipients = useMemo(() => {
//     return recipients
//       .filter((recipient) => recipient.name.trim())
//       .map((recipient) => ({
//         name: recipient.name.trim(),
//         ...(recipient.email.trim()
//           ? { email: recipient.email.trim() }
//           : {}),
//       }));
//   }, [recipients]);

//   const manualValid = manualRecipients.length;

//   const activeCount =
//     mode === "upload"
//       ? uploadValid
//       : manualValid;

//   const finished =
//     details &&
//     ["COMPLETED", "COMPLETED_WITH_ERRORS", "FAILED"].includes(
//       details.status
//     );

//   /*
//    * IMPORTANT FIX:
//    *
//    * previewLoading should only disable the button in upload mode.
//    * Previously it could disable the manual Generate button.
//    */
//   const generateDisabled =
//     submitting ||
//     (mode === "upload" && previewLoading) ||
//     activeCount === 0 ||
//     (mode === "upload" && !preview);

//   // ------------------------------------------------------------
//   // JOB POLLING
//   // ------------------------------------------------------------

//   useEffect(() => {
//     if (!job?.job_id || finished) {
//       return;
//     }

//     let cancelled = false;

//     const poll = async () => {
//       try {
//         const response = await fetch(
//           `${API}/certificate-jobs/${job.job_id}`
//         );

//         if (!response.ok) {
//           throw new Error(
//             `Status request failed (${response.status})`
//           );
//         }

//         const data = await response.json();

//         if (!cancelled) {
//           setDetails(data);
//         }
//       } catch (e) {
//         if (!cancelled) {
//           setError(e.message);
//         }
//       }
//     };

//     poll();

//     const timer = setInterval(poll, 1200);

//     return () => {
//       cancelled = true;
//       clearInterval(timer);
//     };
//   }, [job?.job_id, finished]);

//   // ------------------------------------------------------------
//   // FORM HANDLERS
//   // ------------------------------------------------------------

//   function updateForm(event) {
//     setForm((current) => ({
//       ...current,
//       [event.target.name]: event.target.value,
//     }));
//   }

//   function updateRecipient(index, field, value) {
//     setRecipients((current) =>
//       current.map((recipient, i) =>
//         i === index
//           ? {
//               ...recipient,
//               [field]: value,
//             }
//           : recipient
//       )
//     );
//   }

//   function addRecipient() {
//     setRecipients((current) => [
//       ...current,
//       blankRecipient(),
//     ]);
//   }

//   function removeRecipient(index) {
//     setRecipients((current) => {
//       if (current.length === 1) {
//         return [blankRecipient()];
//       }

//       return current.filter(
//         (_, i) => i !== index
//       );
//     });
//   }

//   // ------------------------------------------------------------
//   // MODE SWITCHING
//   // ------------------------------------------------------------

//   function switchMode(nextMode) {
//     setError("");

//     setMode(nextMode);

//     /*
//      * If switching to manual mode, CSV preview state should
//      * not affect the manual Generate button.
//      */
//     if (nextMode === "manual") {
//       setPreviewLoading(false);
//     }

//     /*
//      * If switching to upload mode, keep the existing file if
//      * there is one, otherwise show the upload interface.
//      */
//     if (nextMode === "upload") {
//       setError("");
//     }
//   }

//   // ------------------------------------------------------------
//   // RESET
//   // ------------------------------------------------------------

//   function resetAll() {
//     setJob(null);
//     setDetails(null);
//     setError("");

//     setFile(null);
//     setPreview(null);

//     setNameColumn("");
//     setEmailColumn("");

//     setRecipients([blankRecipient()]);

//     setPreviewLoading(false);
//     setSubmitting(false);

//     setMode("upload");
//   }

//   // ------------------------------------------------------------
//   // CSV / EXCEL PREVIEW
//   // ------------------------------------------------------------

//   async function previewFile(
//     nextFile,
//     nextNameColumn = "",
//     nextEmailColumn = ""
//   ) {
//     if (!nextFile) {
//       return;
//     }

//     setError("");
//     setPreview(null);
//     setPreviewLoading(true);

//     try {
//       const data = new FormData();

//       data.append("file", nextFile);

//       if (nextNameColumn !== "") {
//         data.append(
//           "name_column",
//           nextNameColumn
//         );
//       }

//       if (nextEmailColumn !== "") {
//         data.append(
//           "email_column",
//           nextEmailColumn
//         );
//       }

//       const response = await fetch(
//         `${API}/certificate-jobs/import-preview`,
//         {
//           method: "POST",
//           body: data,
//         }
//       );

//       let body;

//       try {
//         body = await response.json();
//       } catch {
//         body = {};
//       }

//       if (!response.ok) {
//         throw new Error(
//           body.detail ||
//             `Could not read the file (${response.status}).`
//         );
//       }

//       setPreview(body);

//       setNameColumn(
//         body.name_column == null
//           ? ""
//           : String(body.name_column)
//       );

//       setEmailColumn(
//         body.email_column == null
//           ? "-1"
//           : String(body.email_column)
//       );
//     } catch (e) {
//       console.error("File preview error:", e);

//       setPreview(null);

//       setError(
//         e.message ||
//           "Could not read the uploaded file."
//       );
//     } finally {
//       setPreviewLoading(false);
//     }
//   }

//   function onFileChange(event) {
//     const nextFile =
//       event.target.files?.[0];

//     setFile(nextFile || null);
//     setPreview(null);
//     setError("");

//     if (!nextFile) {
//       return;
//     }

//     previewFile(nextFile);
//   }

//   function onMappingChange(type, value) {
//     const nextName =
//       type === "name"
//         ? value
//         : nameColumn;

//     const nextEmail =
//       type === "email"
//         ? value
//         : emailColumn;

//     if (type === "name") {
//       setNameColumn(value);
//     } else {
//       setEmailColumn(value);
//     }

//     if (
//       file &&
//       nextName !== ""
//     ) {
//       previewFile(
//         file,
//         nextName,
//         nextEmail
//       );
//     }
//   }

//   // ------------------------------------------------------------
//   // SUBMIT JOB
//   // ------------------------------------------------------------

//   async function submit(event) {
//     event.preventDefault();

//     setError("");
//     setJob(null);
//     setDetails(null);

//     // ----------------------------------------
//     // Validate certificate details
//     // ----------------------------------------

//     if (!form.title.trim()) {
//       setError(
//         "Enter a certificate title."
//       );
//       return;
//     }

//     if (!form.event_name.trim()) {
//       setError(
//         "Enter the event name."
//       );
//       return;
//     }

//     if (!form.issuer.trim()) {
//       setError(
//         "Enter the issuer."
//       );
//       return;
//     }

//     if (!form.issue_date) {
//       setError(
//         "Select the issue date."
//       );
//       return;
//     }

//     // ----------------------------------------
//     // Get recipients
//     // ----------------------------------------

//     let list = [];

//     if (mode === "upload") {
//       list = preview?.recipients || [];
//     } else {
//       list = manualRecipients;
//     }

//     if (!list.length) {
//       setError(
//         "Add at least one valid recipient."
//       );
//       return;
//     }

//     // ----------------------------------------
//     // Submit
//     // ----------------------------------------

//     setSubmitting(true);

//     try {
//       const response = await fetch(
//         `${API}/certificate-jobs`,
//         {
//           method: "POST",
//           headers: {
//             "Content-Type":
//               "application/json",
//           },
//           body: JSON.stringify({
//             ...form,
//             recipients: list,
//           }),
//         }
//       );

//       let body;

//       try {
//         body = await response.json();
//       } catch {
//         body = {};
//       }

//       if (!response.ok) {
//         throw new Error(
//           body.detail ||
//             `Could not create the certificate job (${response.status}).`
//         );
//       }

//       setJob(body);
//       setDetails(body);
//     } catch (e) {
//       console.error(
//         "Certificate generation error:",
//         e
//       );

//       setError(
//         e.message ||
//           "Could not create the certificate job."
//       );
//     } finally {
//       setSubmitting(false);
//     }
//   }

//   // ------------------------------------------------------------
//   // DOWNLOAD
//   // ------------------------------------------------------------

//   const statusLabel =
//     details?.status ||
//     job?.status ||
//     "";

//   const downloadUrl =
//     details?.download_all_url
//       ? `${API_ROOT}${details.download_all_url}`
//       : null;

//   // ------------------------------------------------------------
//   // UI
//   // ------------------------------------------------------------

//   return (
//     <main className="page">

//       {/* HERO */}

//       <header className="hero">
//         <div className="eyebrow">
//           CERTGEN
//         </div>

//         <h1>
//           Bulk Certificate Generator
//         </h1>

//         <p>
//           Turn a school, college or event
//           participant list into a batch of
//           ready-to-download certificates.
//         </p>
//       </header>

//       {/* MAIN CARD */}

//       <section className="card">

//         {!job ? (

//           <form onSubmit={submit}>

//             {/* CERTIFICATE DETAILS */}

//             <div className="section-title">
//               1. Certificate details
//             </div>

//             <div className="grid">

//               <label>
//                 Certificate title

//                 <input
//                   name="title"
//                   value={form.title}
//                   onChange={updateForm}
//                   placeholder="Certificate of Participation"
//                   required
//                 />
//               </label>

//               <label>
//                 Event name

//                 <input
//                   name="event_name"
//                   value={form.event_name}
//                   onChange={updateForm}
//                   placeholder="Python Backend Workshop 2026"
//                   required
//                 />
//               </label>

//               <label>
//                 Issuer

//                 <input
//                   name="issuer"
//                   value={form.issuer}
//                   onChange={updateForm}
//                   placeholder="Academy Name"
//                   required
//                 />
//               </label>

//               <label>
//                 Issue date

//                 <input
//                   type="date"
//                   name="issue_date"
//                   value={form.issue_date}
//                   onChange={updateForm}
//                   required
//                 />
//               </label>

//             </div>

//             {/* RECIPIENTS */}

//             <div className="section-title source-title">
//               2. Add recipients
//             </div>

//             {/* TABS */}

//             <div className="tabs">

//               <button
//                 type="button"
//                 className={
//                   mode === "upload"
//                     ? "tab active"
//                     : "tab"
//                 }
//                 onClick={() =>
//                   switchMode("upload")
//                 }
//               >
//                 Upload CSV / Excel
//               </button>

//               <button
//                 type="button"
//                 className={
//                   mode === "manual"
//                     ? "tab active"
//                     : "tab"
//                 }
//                 onClick={() =>
//                   switchMode("manual")
//                 }
//               >
//                 Enter manually
//               </button>

//             </div>

//             {/* UPLOAD MODE */}

//             {mode === "upload" ? (

//               <div>

//                 <label className="dropzone">

//                   <input
//                     type="file"
//                     accept=".csv,.xlsx,.xlsm"
//                     onChange={onFileChange}
//                   />

//                   <span className="upload-icon">
//                     ↑
//                   </span>

//                   <strong>
//                     {file
//                       ? file.name
//                       : "Choose a CSV or Excel file"}
//                   </strong>

//                   <span>
//                     CSV, XLSX or XLSM ·
//                     maximum 5 MB ·
//                     up to 1000 recipients
//                   </span>

//                 </label>

//                 {/* LOADING */}

//                 {previewLoading && (
//                   <div className="loading">
//                     Reading your file...
//                   </div>
//                 )}

//                 {/* PREVIEW */}

//                 {preview && (

//                   <div className="import-panel">

//                     {/* SUMMARY */}

//                     <div className="import-summary">

//                       <div>
//                         <strong>
//                           {preview.valid_count}
//                         </strong>

//                         <span>
//                           valid
//                         </span>
//                       </div>

//                       <div>
//                         <strong>
//                           {preview.invalid_count}
//                         </strong>

//                         <span>
//                           invalid
//                         </span>
//                       </div>

//                       <div>
//                         <strong>
//                           {preview.duplicate_count}
//                         </strong>

//                         <span>
//                           duplicates
//                         </span>
//                       </div>

//                     </div>

//                     {/* COLUMN MAPPING */}

//                     <div className="mapping">

//                       <label>
//                         Name column

//                         <select
//                           value={nameColumn}
//                           onChange={(event) =>
//                             onMappingChange(
//                               "name",
//                               event.target.value
//                             )
//                           }
//                         >

//                           <option value="">
//                             Select name column
//                           </option>

//                           {preview.columns.map(
//                             (column) => (
//                               <option
//                                 key={column.index}
//                                 value={column.index}
//                               >
//                                 {column.name}
//                               </option>
//                             )
//                           )}

//                         </select>

//                       </label>

//                       <label>
//                         Email column{" "}
//                         <span className="optional">
//                           optional
//                         </span>

//                         <select
//                           value={emailColumn}
//                           onChange={(event) =>
//                             onMappingChange(
//                               "email",
//                               event.target.value
//                             )
//                           }
//                         >

//                           <option value="-1">
//                             No email column
//                           </option>

//                           {preview.columns.map(
//                             (column) => (
//                               <option
//                                 key={column.index}
//                                 value={column.index}
//                               >
//                                 {column.name}
//                               </option>
//                             )
//                           )}

//                         </select>

//                       </label>

//                     </div>

//                     {/* PREVIEW TABLE */}

//                     <div className="preview-header">

//                       <span>
//                         Preview
//                       </span>

//                       <small>
//                         {preview.total_rows}
//                         {" "}
//                         data rows detected
//                       </small>

//                     </div>

//                     <div className="table-wrap">

//                       <table>

//                         <thead>
//                           <tr>
//                             <th>Row</th>
//                             <th>Status</th>
//                             <th>Name</th>
//                             <th>Email</th>
//                             <th>Issue</th>
//                           </tr>
//                         </thead>

//                         <tbody>

//                           {preview.rows.map(
//                             (row) => (

//                               <tr
//                                 key={
//                                   row.row_number
//                                 }
//                               >

//                                 <td>
//                                   {row.row_number}
//                                 </td>

//                                 <td>
//                                   <span
//                                     className={
//                                       row.valid
//                                         ? "pill ok"
//                                         : "pill bad"
//                                     }
//                                   >
//                                     {row.valid
//                                       ? "Valid"
//                                       : "Invalid"}
//                                   </span>
//                                 </td>

//                                 <td>
//                                   {row.name || "—"}
//                                 </td>

//                                 <td>
//                                   {row.email || "—"}
//                                 </td>

//                                 <td>
//                                   {row.error ||
//                                     (row.duplicate
//                                       ? "Duplicate name"
//                                       : "—")}
//                                 </td>

//                               </tr>

//                             )
//                           )}

//                         </tbody>

//                       </table>

//                     </div>

//                     {/* WARNING */}

//                     {preview.invalid_count > 0 && (
//                       <div className="warning">
//                         Invalid rows will be skipped.
//                         Only the{" "}
//                         {preview.valid_count}{" "}
//                         valid recipients will
//                         be submitted.
//                       </div>
//                     )}

//                   </div>

//                 )}

//               </div>

//             ) : (

//               /* MANUAL MODE */

//               <div>

//                 <div className="recipient-heading">

//                   <span>
//                     {manualValid} ready
//                   </span>

//                   <button
//                     type="button"
//                     className="secondary"
//                     onClick={addRecipient}
//                   >
//                     + Add recipient
//                   </button>

//                 </div>

//                 <div className="recipient-list">

//                   {recipients.map(
//                     (recipient, index) => (

//                       <div
//                         className="recipient"
//                         key={index}
//                       >

//                         <span className="number">
//                           {index + 1}
//                         </span>

//                         <input
//                           value={
//                             recipient.name
//                           }
//                           onChange={(event) =>
//                             updateRecipient(
//                               index,
//                               "name",
//                               event.target.value
//                             )
//                           }
//                           placeholder="Recipient name"
//                         />

//                         <input
//                           value={
//                             recipient.email
//                           }
//                           onChange={(event) =>
//                             updateRecipient(
//                               index,
//                               "email",
//                               event.target.value
//                             )
//                           }
//                           placeholder="Email (optional)"
//                           type="email"
//                         />

//                         <button
//                           type="button"
//                           className="icon"
//                           onClick={() =>
//                             removeRecipient(index)
//                           }
//                           aria-label="Remove recipient"
//                         >
//                           ×
//                         </button>

//                       </div>

//                     )
//                   )}

//                 </div>

//               </div>

//             )}

//             {/* ERROR */}

//             {error && (
//               <div
//                 className="error"
//                 role="alert"
//               >
//                 {error}
//               </div>
//             )}

//             {/* GENERATE BUTTON */}

//             <button
//               type="submit"
//               className="primary"
//               disabled={generateDisabled}
//             >

//               {submitting
//                 ? "Submitting..."
//                 : activeCount > 0
//                 ? `Generate ${activeCount} certificate${
//                     activeCount === 1
//                       ? ""
//                       : "s"
//                   }`
//                 : "Generate certificates"}

//             </button>

//           </form>

//         ) : (

//           /* JOB RESULT */

//           <div>

//             <div className="result-head">

//               <div>

//                 <div className="section-title">
//                   Generation job
//                 </div>

//                 <h2>
//                   {form.event_name}
//                 </h2>

//                 <p className="muted">
//                   Job ID:{" "}
//                   <code>
//                     {job.job_id}
//                   </code>
//                 </p>

//               </div>

//               <span
//                 className={`status ${String(
//                   statusLabel
//                 ).toLowerCase()}`}
//               >
//                 {statusLabel}
//               </span>

//             </div>

//             {/* PROGRESS */}

//             <div className="progress-wrap">

//               <div className="progress-label">

//                 <span>
//                   Progress
//                 </span>

//                 <strong>
//                   {Math.round(
//                     details?.progress_percent ?? 0
//                   )}
//                   %
//                 </strong>

//               </div>

//               <div className="progress">

//                 <span
//                   style={{
//                     width: `${
//                       details?.progress_percent ?? 0
//                     }%`,
//                   }}
//                 />

//               </div>

//               <div className="stats">

//                 <span>
//                   ✓{" "}
//                   {details?.success_count ?? 0}
//                   {" "}
//                   successful
//                 </span>

//                 <span>
//                   •{" "}
//                   {details?.pending_count ?? 0}
//                   {" "}
//                   pending
//                 </span>

//                 <span>
//                   •{" "}
//                   {details?.failed_count ?? 0}
//                   {" "}
//                   failed
//                 </span>

//               </div>

//             </div>

//             {/* DOWNLOAD */}

//             {downloadUrl && (

//               <a
//                 className="primary download"
//                 href={downloadUrl}
//                 download
//               >
//                 Download all certificates (ZIP)
//               </a>

//             )}

//             {/* NEW JOB */}

//             {finished && (

//               <button
//                 type="button"
//                 className="secondary full"
//                 onClick={resetAll}
//               >
//                 Create another batch
//               </button>

//             )}

//           </div>

//         )}

//       </section>

//       <footer>
//         FastAPI · React · ReportLab ·
//         CSV / Excel import
//       </footer>

//     </main>
//   );
// }

// createRoot(
//   document.getElementById("root")
// ).render(
//   <App />
// );


