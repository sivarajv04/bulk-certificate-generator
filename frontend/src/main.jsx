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
