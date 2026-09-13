"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

const supabase = createClient();

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

type Project = {
  id: number;
  name: string;
  location: string;
  client_name?: string | null;
  start_date?: string | null;
  expected_completion_date?: string | null;
  status: string;
  progress_percent?: number | null;
  created_at: string;
};

type ProjectSummary = Project & {
  activeIssues: number;
  totalEstimated: number;
  totalActual: number;
  remainingBudget: number;
};

type SiteData = {
  id: number;
  project_id?: number | null;
  area: string;
  date: string;
  issue_type: string;
  observation: string;
  photo_name: string | null;
  photo_url: string | null;
  severity?: string | null;
  status?: string | null;
  source?: string | null;
  created_at: string;
};

type Report = {
  id: number;
  project_id?: number | null;
  title: string;
  description: string;
  report_date: string;
  report_type?: string;
  created_at: string;
};

type Incident = {
  id: number;
  project_id?: number | null;
  area: string;
  incident_type: string;
  description: string | null;
  severity: string | null;
  status: string | null;
  incident_date: string;
  created_at: string;
};

type MaterialItem = {
  id: number;
  project_id?: number | null;
  area: string;
  material_name: string;
  quantity: number;
  unit: string;
  status: string;
  created_at: string;
};

type CostEntry = {
  id: number;
  project_id?: number | null;
  category: string;
  description: string | null;
  estimated_cost: number;
  actual_cost: number;
  date: string;
  area: string | null;
  created_at: string;
};

const SEVERITY_RANK: Record<string, number> = { Low: 1, Medium: 2, High: 3 };
const COST_CATEGORIES = [
  "Materials",
  "Labour",
  "Equipment",
  "Transportation",
  "Subcontractor",
  "Safety",
  "Other",
];

function formatCurrency(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function downloadCSV(filename: string, rows: Record<string, any>[]) {
  if (!rows || rows.length === 0) {
    alert("No data available to export yet.");
    return;
  }
  const headers = Object.keys(rows[0]);
  const csvLines = [headers.join(",")].concat(
    rows.map((row) =>
      headers
        .map((h) => `"${String(row[h] ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
  );
  const blob = new Blob([csvLines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function extractWeeks(q: string): number | null {
  const numMatch = q.match(/(\d+)\s*week/);
  if (numMatch) return parseInt(numMatch[1], 10);
  if (q.includes("last week") || q.includes("past week")) return 1;
  if (q.includes("weeks")) return 2;
  return null;
}

export default function Home() {
  // -------------------------------------------------------------------
  // VIEW / NAVIGATION
  // -------------------------------------------------------------------
  const [view, setView] = useState<"projects" | "dashboard">("projects");

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectSummaries, setProjectSummaries] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  const currentProject = projects.find((p) => p.id === selectedProjectId) || null;

  // -------------------------------------------------------------------
  // PROJECT-SCOPED DATA
  // -------------------------------------------------------------------
  const [siteData, setSiteData] = useState<SiteData[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [costs, setCosts] = useState<CostEntry[]>([]);
  const [aiObservationCount, setAiObservationCount] = useState<number | null>(null);

  // -------------------------------------------------------------------
  // MODALS
  // -------------------------------------------------------------------
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [showCostModal, setShowCostModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectModalMode, setProjectModalMode] = useState<"create" | "edit">("create");

  // -------------------------------------------------------------------
  // SEARCH / FILTERS (site data)
  // -------------------------------------------------------------------
  const [search, setSearch] = useState("");
  const [issueFilter, setIssueFilter] = useState("All");
  const [severityFilter, setSeverityFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("");

  // -------------------------------------------------------------------
  // PHOTO / AI PHOTO ANALYSIS
  // -------------------------------------------------------------------
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [aiResult, setAiResult] = useState("");
  const [aiMode, setAiMode] = useState<"real-vision" | "rule-based-demo" | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);

  // -------------------------------------------------------------------
  // AI ASSISTANT
  // -------------------------------------------------------------------
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");

  // -------------------------------------------------------------------
  // AI INSIGHTS (cost / project / progress) — real LLM call with honest
  // rule-based fallback, same pattern as photo analysis.
  // -------------------------------------------------------------------
  const [costInsight, setCostInsight] = useState("");
  const [costInsightMode, setCostInsightMode] = useState<"real-ai" | "rule-based" | null>(null);
  const [costInsightLoading, setCostInsightLoading] = useState(false);

  const [projectInsight, setProjectInsight] = useState("");
  const [projectInsightMode, setProjectInsightMode] = useState<"real-ai" | "rule-based" | null>(null);
  const [projectInsightLoading, setProjectInsightLoading] = useState(false);

  const [progressInsight, setProgressInsight] = useState("");
  const [progressInsightMode, setProgressInsightMode] = useState<"real-ai" | "rule-based" | null>(null);
  const [progressInsightLoading, setProgressInsightLoading] = useState(false);

  const [reportText, setReportText] = useState("");

  // -------------------------------------------------------------------
  // FORMS
  // -------------------------------------------------------------------
  const [formData, setFormData] = useState({
    area: "",
    date: "",
    issueType: "",
    observation: "",
    photoName: "",
    severity: "Medium",
    status: "Open",
    source: "Manual Entry",
  });

  const [incidentForm, setIncidentForm] = useState({
    area: "",
    incidentType: "",
    description: "",
    severity: "Medium",
    date: "",
  });

  const [materialForm, setMaterialForm] = useState({
    area: "",
    materialName: "",
    quantity: "",
    unit: "units",
    status: "Available",
  });

  const [costForm, setCostForm] = useState({
    category: "Materials",
    description: "",
    estimatedCost: "",
    actualCost: "",
    date: "",
    area: "",
  });

  const [projectForm, setProjectForm] = useState({
    name: "",
    location: "",
    clientName: "",
    startDate: "",
    expectedCompletionDate: "",
    status: "Active",
  });

  // -------------------------------------------------------------------
  // LOAD PROJECTS ON MOUNT
  // -------------------------------------------------------------------
  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId !== null) {
      loadSiteData(selectedProjectId);
      loadReports(selectedProjectId);
      loadIncidents(selectedProjectId);
      loadMaterials(selectedProjectId);
      loadCosts(selectedProjectId);
      loadAiObservationCount(selectedProjectId);
      setCostInsight("");
      setCostInsightMode(null);
      setProjectInsight("");
      setProjectInsightMode(null);
      setProgressInsight("");
      setProgressInsightMode(null);
    } else {
      setSiteData([]);
      setReports([]);
      setIncidents([]);
      setMaterials([]);
      setCosts([]);
      setAiObservationCount(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  useEffect(() => {
    if (view === "projects" && projects.length > 0) {
      loadProjectSummaries(projects);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, projects]);

  async function loadProjects() {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: true });

    if (error || !data) {
      setProjects([]);
      return;
    }

    setProjects(data);
    setSelectedProjectId((prev) => prev ?? (data[0]?.id ?? null));
  }

  async function loadProjectSummaries(projectList: Project[]) {
    const summaries = await Promise.all(
      projectList.map(async (p) => {
        const [issueCountRes, costRowsRes] = await Promise.all([
          supabase
            .from("site_data")
            .select("*", { count: "exact", head: true })
            .eq("project_id", p.id)
            .neq("status", "Resolved"),
          supabase.from("costs").select("estimated_cost, actual_cost").eq("project_id", p.id),
        ]);

        const costRows = costRowsRes.data || [];
        const totalEstimated = costRows.reduce(
          (sum, c: any) => sum + (Number(c.estimated_cost) || 0),
          0
        );
        const totalActual = costRows.reduce(
          (sum, c: any) => sum + (Number(c.actual_cost) || 0),
          0
        );

        return {
          ...p,
          activeIssues: issueCountRes.count || 0,
          totalEstimated,
          totalActual,
          remainingBudget: totalEstimated - totalActual,
        };
      })
    );

    setProjectSummaries(summaries);
  }

  async function loadSiteData(projectId: number) {
    const { data, error } = await supabase
      .from("site_data")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }
    setSiteData(data || []);
  }

  async function loadReports(projectId: number) {
    const { data, error } = await supabase
      .from("reports")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }
    setReports(data || []);
  }

  async function loadIncidents(projectId: number) {
    const { data, error } = await supabase
      .from("incidents")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      setIncidents([]);
      return;
    }
    setIncidents(data || []);
  }

  async function loadMaterials(projectId: number) {
    const { data, error } = await supabase
      .from("materials")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      setMaterials([]);
      return;
    }
    setMaterials(data || []);
  }

  async function loadCosts(projectId: number) {
    const { data, error } = await supabase
      .from("costs")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      setCosts([]);
      return;
    }
    setCosts(data || []);
  }

  async function loadAiObservationCount(projectId: number) {
    const { count, error } = await supabase
      .from("ai_observations")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId);

    if (error) {
      setAiObservationCount(null);
      return;
    }
    setAiObservationCount(count ?? 0);
  }

  // -------------------------------------------------------------------
  // PROJECT MANAGEMENT
  // -------------------------------------------------------------------
  function openCreateProjectModal() {
    setProjectModalMode("create");
    setProjectForm({
      name: "",
      location: "",
      clientName: "",
      startDate: "",
      expectedCompletionDate: "",
      status: "Active",
    });
    setShowProjectModal(true);
  }

  function openEditProjectModal() {
    if (!currentProject) return;
    setProjectModalMode("edit");
    setProjectForm({
      name: currentProject.name || "",
      location: currentProject.location || "",
      clientName: currentProject.client_name || "",
      startDate: currentProject.start_date || "",
      expectedCompletionDate: currentProject.expected_completion_date || "",
      status: currentProject.status || "Active",
    });
    setShowProjectModal(true);
  }

  async function saveProjectInfo() {
    if (!projectForm.name.trim()) {
      alert("Project name is required.");
      return;
    }

    const payload = {
      name: projectForm.name,
      location: projectForm.location,
      client_name: projectForm.clientName || null,
      start_date: projectForm.startDate || null,
      expected_completion_date: projectForm.expectedCompletionDate || null,
      status: projectForm.status,
    };

    if (projectModalMode === "create") {
      const { data, error } = await supabase
        .from("projects")
        .insert([{ ...payload, progress_percent: 0 }])
        .select();

      if (error) {
        alert(
          "Error creating project: " +
            error.message +
            "\n\nHave you run supabase/migration_v2_projects_and_costs.sql yet?"
        );
        return;
      }

      if (data && data[0]) {
        setProjects((prev) => [...prev, data[0]]);
        setSelectedProjectId(data[0].id);
        setView("dashboard");
      }
    } else if (currentProject) {
      const { error } = await supabase
        .from("projects")
        .update(payload)
        .eq("id", currentProject.id);

      if (error) {
        alert("Error updating project: " + error.message);
        return;
      }

      setProjects((prev) =>
        prev.map((p) => (p.id === currentProject.id ? { ...p, ...payload } : p))
      );
    }

    setShowProjectModal(false);
  }

  function selectProject(id: number) {
    setSelectedProjectId(id);
    setView("dashboard");
  }

  // -------------------------------------------------------------------
  // PHOTO HANDLING
  // -------------------------------------------------------------------
  function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));

    setFormData((prev) => ({ ...prev, photoName: file.name }));
  }

  // ---------------------------------------------------------------------
  // PHOTO AI ANALYSIS
  // Tries the real GPT-5 Vision endpoint first. Falls back to an
  // explicitly-labeled rule-based demo result if that call fails.
  // Every run is logged to ai_observations, scoped to the selected project.
  // ---------------------------------------------------------------------
  async function analyzePhoto() {
    if (!photo) {
      alert("Please upload a construction site photo first.");
      return;
    }
    if (!selectedProjectId) {
      alert("Please select or create a project first.");
      return;
    }

    setAiAnalyzing(true);
    setAiResult("");
    setAiMode(null);

    let resultText = "";
    let mode: "real-vision" | "rule-based-demo" = "rule-based-demo";
    let detectedIssueType = "Safety Issue";
    let detectedSeverity = "Medium";

    try {
      const uploadForm = new FormData();
      uploadForm.append("photo", photo);

      const res = await fetch("/api/analyze-photo", {
        method: "POST",
        body: uploadForm,
      });

      const json = await res.json();

      if (!res.ok || json.error || !json.result) {
        throw new Error(json.error || "AI vision service unavailable.");
      }

      resultText = json.result;
      mode = "real-vision";

      const lower = resultText.toLowerCase();
      if (
        lower.includes("ppe") ||
        lower.includes("helmet") ||
        lower.includes("unsafe") ||
        lower.includes("safety")
      ) {
        detectedIssueType = "Safety Issue";
      } else if (
        lower.includes("quality") ||
        lower.includes("defect") ||
        lower.includes("crack")
      ) {
        detectedIssueType = "Quality Issue";
      } else if (lower.includes("material")) {
        detectedIssueType = "Material Issue";
      } else if (lower.includes("progress") || lower.includes("complete")) {
        detectedIssueType = "Progress Issue";
      } else {
        detectedIssueType = "Other";
      }

      if (
        lower.includes("high risk") ||
        lower.includes("severe") ||
        lower.includes("critical")
      ) {
        detectedSeverity = "High";
      } else if (lower.includes("low risk") || lower.includes("minor")) {
        detectedSeverity = "Low";
      }
    } catch (err) {
      mode = "rule-based-demo";
      detectedIssueType = "Safety Issue";
      detectedSeverity = "Medium";
      resultText =
        "Demo Analysis (rule-based — live AI vision unavailable)\n\n" +
        "• Construction workers detected\n" +
        "• Helmet/PPE not clearly visible\n" +
        "• Safety compliance risk identified\n" +
        "• Risk Level: Medium\n\n" +
        "Recommended Action:\n" +
        "Ensure all workers wear appropriate safety helmets and required PPE before continuing work.";
    }

    setAiResult(resultText);
    setAiMode(mode);

    setFormData((prev) => ({
      ...prev,
      issueType: detectedIssueType,
      severity: detectedSeverity,
      observation:
        mode === "real-vision"
          ? resultText.slice(0, 600)
          : "Helmet/PPE not clearly visible. Safety compliance risk identified.",
      source: "Photo AI Analysis",
    }));

    fetch("/api/observations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: selectedProjectId,
        area: formData.area || "Unspecified",
        issue_type: detectedIssueType,
        severity: detectedSeverity,
        ai_mode: mode,
        raw_result: resultText,
      }),
    })
      .then(() => loadAiObservationCount(selectedProjectId))
      .catch(() => {});

    setAiAnalyzing(false);
  }

  // -------------------------------------------------------------------
  // SITE DATA
  // -------------------------------------------------------------------
  async function handleSave() {
    if (!selectedProjectId) {
      alert("Please select or create a project first.");
      return;
    }
    if (!formData.area || !formData.date || !formData.issueType || !formData.observation) {
      alert("Please fill all required fields.");
      return;
    }

    let photoUrl: string | null = null;

    if (photo) {
      const fileExt = photo.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("site-photos")
        .upload(fileName, photo);

      if (uploadError) {
        console.error(uploadError);
        alert("Photo upload failed: " + uploadError.message);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("site-photos")
        .getPublicUrl(fileName);

      photoUrl = publicUrlData.publicUrl;
    }

    const { data, error } = await supabase
      .from("site_data")
      .insert([
        {
          project_id: selectedProjectId,
          area: formData.area,
          date: formData.date,
          issue_type: formData.issueType,
          observation: formData.observation,
          photo_name: formData.photoName || null,
          photo_url: photoUrl,
          severity: formData.severity,
          status: formData.status,
          source: formData.source,
        },
      ])
      .select();

    if (error) {
      console.error(error);
      alert("Error saving data: " + error.message);
      return;
    }

    if (data) setSiteData((prev) => [data[0], ...prev]);

    alert("Site data saved successfully!");

    setFormData({
      area: "",
      date: "",
      issueType: "",
      observation: "",
      photoName: "",
      severity: "Medium",
      status: "Open",
      source: "Manual Entry",
    });
    setPhoto(null);
    setPhotoPreview("");
    setAiResult("");
    setAiMode(null);
    setIsModalOpen(false);
  }

  async function deleteData(id: number) {
    if (!confirm("Are you sure you want to delete this record?")) return;

    const { error } = await supabase.from("site_data").delete().eq("id", id);
    if (error) {
      alert("Error deleting data: " + error.message);
      return;
    }
    setSiteData((prev) => prev.filter((item) => item.id !== id));
  }

  // -------------------------------------------------------------------
  // PROGRESS REPORTS (persisted, per-project progress_percent)
  // -------------------------------------------------------------------
  async function saveProgressReport() {
    if (!selectedProjectId || !currentProject) {
      alert("Please select or create a project first.");
      return;
    }
    if (!reportText.trim()) {
      alert("Please enter today's progress report.");
      return;
    }

    const { error } = await supabase.from("reports").insert([
      {
        project_id: selectedProjectId,
        report_type: "Daily Progress Report",
        title: "Daily Construction Progress",
        description: reportText,
        report_date: new Date().toISOString().split("T")[0],
      },
    ]);

    if (error) {
      alert("Error saving report: " + error.message);
      return;
    }

    const newProgress = Math.min((currentProject.progress_percent || 0) + 10, 100);

    const { error: progressError } = await supabase
      .from("projects")
      .update({ progress_percent: newProgress })
      .eq("id", selectedProjectId);

    if (!progressError) {
      setProjects((prev) =>
        prev.map((p) => (p.id === selectedProjectId ? { ...p, progress_percent: newProgress } : p))
      );
    }

    loadReports(selectedProjectId);
    alert("Daily progress report saved successfully!");
    setReportText("");
    setShowReport(false);
  }

  // -------------------------------------------------------------------
  // INCIDENTS
  // -------------------------------------------------------------------
  async function saveIncident() {
    if (!selectedProjectId) {
      alert("Please select or create a project first.");
      return;
    }
    if (!incidentForm.area || !incidentForm.incidentType || !incidentForm.date) {
      alert("Please fill area, incident type, and date.");
      return;
    }

    const { data, error } = await supabase
      .from("incidents")
      .insert([
        {
          project_id: selectedProjectId,
          area: incidentForm.area,
          incident_type: incidentForm.incidentType,
          description: incidentForm.description,
          severity: incidentForm.severity,
          incident_date: incidentForm.date,
          status: "Open",
        },
      ])
      .select();

    if (error) {
      alert("Error saving incident: " + error.message + "\n\nHave you run the migration SQL?");
      return;
    }

    if (data) setIncidents((prev) => [data[0], ...prev]);
    alert("Safety incident recorded.");
    setIncidentForm({ area: "", incidentType: "", description: "", severity: "Medium", date: "" });
    setShowIncidentModal(false);
  }

  async function deleteIncident(id: number) {
    if (!confirm("Delete this incident record?")) return;
    const { error } = await supabase.from("incidents").delete().eq("id", id);
    if (error) {
      alert("Error deleting incident: " + error.message);
      return;
    }
    setIncidents((prev) => prev.filter((item) => item.id !== id));
  }

  // -------------------------------------------------------------------
  // MATERIALS
  // -------------------------------------------------------------------
  async function saveMaterial() {
    if (!selectedProjectId) {
      alert("Please select or create a project first.");
      return;
    }
    if (!materialForm.area || !materialForm.materialName) {
      alert("Please fill area and material name.");
      return;
    }

    const { data, error } = await supabase
      .from("materials")
      .insert([
        {
          project_id: selectedProjectId,
          area: materialForm.area,
          material_name: materialForm.materialName,
          quantity: Number(materialForm.quantity) || 0,
          unit: materialForm.unit || "units",
          status: materialForm.status || "Available",
        },
      ])
      .select();

    if (error) {
      alert("Error saving material: " + error.message + "\n\nHave you run the migration SQL?");
      return;
    }

    if (data) setMaterials((prev) => [data[0], ...prev]);
    alert("Material record saved.");
    setMaterialForm({ area: "", materialName: "", quantity: "", unit: "units", status: "Available" });
    setShowMaterialModal(false);
  }

  async function deleteMaterial(id: number) {
    if (!confirm("Delete this material record?")) return;
    const { error } = await supabase.from("materials").delete().eq("id", id);
    if (error) {
      alert("Error deleting material: " + error.message);
      return;
    }
    setMaterials((prev) => prev.filter((item) => item.id !== id));
  }

  // -------------------------------------------------------------------
  // COST ANALYSIS
  // -------------------------------------------------------------------
  async function saveCost() {
    if (!selectedProjectId) {
      alert("Please select or create a project first.");
      return;
    }
    if (!costForm.category || !costForm.date) {
      alert("Please fill category and date.");
      return;
    }

    const { data, error } = await supabase
      .from("costs")
      .insert([
        {
          project_id: selectedProjectId,
          category: costForm.category,
          description: costForm.description || null,
          estimated_cost: Number(costForm.estimatedCost) || 0,
          actual_cost: Number(costForm.actualCost) || 0,
          date: costForm.date,
          area: costForm.area || null,
        },
      ])
      .select();

    if (error) {
      alert(
        "Error saving cost entry: " +
          error.message +
          "\n\nHave you run supabase/migration_v2_projects_and_costs.sql yet?"
      );
      return;
    }

    if (data) setCosts((prev) => [data[0], ...prev]);
    alert("Cost entry saved.");
    setCostForm({
      category: "Materials",
      description: "",
      estimatedCost: "",
      actualCost: "",
      date: "",
      area: "",
    });
    setShowCostModal(false);
  }

  async function deleteCost(id: number) {
    if (!confirm("Delete this cost entry?")) return;
    const { error } = await supabase.from("costs").delete().eq("id", id);
    if (error) {
      alert("Error deleting cost entry: " + error.message);
      return;
    }
    setCosts((prev) => prev.filter((item) => item.id !== id));
  }

  // -------------------------------------------------------------------
  // DERIVED / COMPUTED INTELLIGENCE — recomputed from real project-scoped
  // state on every render. Nothing here is hardcoded.
  // -------------------------------------------------------------------

  const filteredData = siteData.filter((item) => {
    const searchText = search.toLowerCase();
    const matchesSearch =
      item.area?.toLowerCase().includes(searchText) ||
      item.issue_type?.toLowerCase().includes(searchText) ||
      item.observation?.toLowerCase().includes(searchText) ||
      item.photo_name?.toLowerCase().includes(searchText);
    const matchesIssue = issueFilter === "All" || item.issue_type === issueFilter;
    const matchesSeverity = severityFilter === "All" || (item.severity || "Medium") === severityFilter;
    const matchesDate = !dateFilter || item.date === dateFilter;
    return matchesSearch && matchesIssue && matchesSeverity && matchesDate;
  });

  const safetyCount = siteData.filter((item) => item.issue_type?.toLowerCase().includes("safety")).length;
  const otherCount = siteData.length - safetyCount;

  const areas = Object.entries(
    siteData.reduce((acc: Record<string, number>, item) => {
      acc[item.area] = (acc[item.area] || 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);

  const topArea = areas[0]?.[0] || "No data";

  const highRiskIncidents = incidents.filter((i) => (i.severity || "").toLowerCase() === "high");
  const openIncidents = incidents.filter((i) => (i.status || "Open").toLowerCase() === "open");

  const lowStockMaterials = materials.filter(
    (m) => m.status?.toLowerCase().includes("low") || m.status?.toLowerCase().includes("required")
  );

  const recurrenceMap = new Map<
    string,
    { area: string; issueType: string; count: number; maxSeverity: string }
  >();

  [
    ...siteData.map((d) => ({ area: d.area, issueType: d.issue_type, severity: d.severity || "Medium" })),
    ...incidents.map((i) => ({ area: i.area, issueType: i.incident_type, severity: i.severity || "Medium" })),
  ].forEach(({ area, issueType, severity }) => {
    if (!area || !issueType) return;
    const key = `${area}__${issueType}`;
    const existing = recurrenceMap.get(key);
    if (existing) {
      existing.count += 1;
      if ((SEVERITY_RANK[severity] || 2) > (SEVERITY_RANK[existing.maxSeverity] || 2)) {
        existing.maxSeverity = severity;
      }
    } else {
      recurrenceMap.set(key, { area, issueType, count: 1, maxSeverity: severity });
    }
  });

  const recurringIssues = Array.from(recurrenceMap.values())
    .filter((r) => r.count >= 2)
    .sort((a, b) => b.count - a.count);

  const knownAreas = Array.from(
    new Set(
      [...siteData.map((d) => d.area), ...incidents.map((i) => i.area), ...materials.map((m) => m.area)].filter(
        Boolean
      )
    )
  );

  function extractArea(q: string): string | null {
    const found = knownAreas.find((a) => a && q.includes(a.toLowerCase()));
    return found || null;
  }

  const allAreaNames = knownAreas;

  const attentionAreas = allAreaNames
    .map((area) => {
      const areaSiteData = siteData.filter((d) => d.area === area);
      const areaSafety = areaSiteData.filter((d) => d.issue_type?.toLowerCase().includes("safety")).length;
      const areaHighSeverity = areaSiteData.filter((d) => (d.severity || "").toLowerCase() === "high").length;
      const areaIncidents = incidents.filter((i) => i.area === area).length;
      const areaHighIncidents = incidents.filter(
        (i) => i.area === area && (i.severity || "").toLowerCase() === "high"
      ).length;
      const areaRecurring = recurringIssues.filter((r) => r.area === area).length;

      const score =
        areaSafety * 3 + areaHighSeverity * 3 + areaIncidents * 4 + areaHighIncidents * 4 + areaRecurring * 2;

      let reason = "General activity monitored, no elevated risk signal";
      if (areaIncidents > 0) reason = `${areaIncidents} safety incident(s) recorded`;
      else if (areaSafety > 0) reason = `${areaSafety} safety issue(s) reported`;
      else if (areaRecurring > 0) reason = `${areaRecurring} recurring issue pattern(s) detected`;

      const recommendation =
        score >= 10
          ? "Immediate supervisor review recommended"
          : score >= 5
          ? "Schedule a safety walkthrough soon"
          : "Continue routine monitoring";

      return { area, score, reason, recommendation };
    })
    .filter((a) => a.score > 0)
    .sort((a, b) => b.score - a.score);

  // Cost calculations
  const totalEstimatedCost = costs.reduce((sum, c) => sum + (Number(c.estimated_cost) || 0), 0);
  const totalActualCost = costs.reduce((sum, c) => sum + (Number(c.actual_cost) || 0), 0);
  const remainingCost = totalEstimatedCost - totalActualCost;
  const costUsedPercent =
    totalEstimatedCost > 0 ? Math.round((totalActualCost / totalEstimatedCost) * 100) : 0;

  const budgetStatus =
    totalEstimatedCost === 0
      ? "No Budget Set"
      : costUsedPercent > 100
      ? "Budget Exceeded"
      : costUsedPercent >= 85
      ? "Budget Attention"
      : "Budget Healthy";

  const budgetStatusColor =
    budgetStatus === "Budget Exceeded"
      ? "bg-red-600 text-white"
      : budgetStatus === "Budget Attention"
      ? "bg-amber-500 text-white"
      : budgetStatus === "Budget Healthy"
      ? "bg-green-600 text-white"
      : "bg-slate-300 text-slate-800";

  const costByCategory = Object.values(
    costs.reduce((acc: Record<string, { category: string; estimated: number; actual: number }>, c) => {
      if (!acc[c.category]) acc[c.category] = { category: c.category, estimated: 0, actual: 0 };
      acc[c.category].estimated += Number(c.estimated_cost) || 0;
      acc[c.category].actual += Number(c.actual_cost) || 0;
      return acc;
    }, {})
  ).sort((a, b) => b.actual - a.actual);

  const maxCostValue = Math.max(1, ...costByCategory.flatMap((c) => [c.estimated, c.actual]));
  const topCostCategory = costByCategory[0]?.category || "None";

  // ---------------------------------------------------------------------
  // AI INSIGHTS — cost / project / progress
  // Tries a real LLM call over the real data summary; falls back to a
  // clearly labeled deterministic summary if the call is unavailable.
  // ---------------------------------------------------------------------
  async function generateCostInsight() {
    setCostInsightLoading(true);
    setCostInsight("");
    setCostInsightMode(null);

    const context = {
      totalEstimatedCost,
      totalActualCost,
      remainingCost,
      costUsedPercent,
      budgetStatus,
      costByCategory,
      recentEntries: costs.slice(0, 10).map((c) => ({
        category: c.category,
        estimated: c.estimated_cost,
        actual: c.actual_cost,
        date: c.date,
        area: c.area,
      })),
    };

    try {
      const res = await fetch("/api/ai-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insightType: "cost", context }),
      });
      const json = await res.json();
      if (!res.ok || json.error || !json.result) throw new Error(json.error || "unavailable");

      setCostInsight(json.result);
      setCostInsightMode("real-ai");
    } catch {
      setCostInsightMode("rule-based");
      setCostInsight(
        costByCategory.length === 0
          ? "No cost entries recorded yet. Add cost entries to generate a rule-based summary."
          : `• Highest spending category: ${topCostCategory}\n` +
              `• Total estimated: ${formatCurrency(totalEstimatedCost)}, total spent: ${formatCurrency(
                totalActualCost
              )}\n` +
              `• Budget status: ${budgetStatus} (${costUsedPercent}% used)\n` +
              `• Remaining budget: ${formatCurrency(remainingCost)}\n` +
              (costUsedPercent >= 85
                ? "• Spending is approaching or exceeding the estimated budget — review upcoming costs."
                : "• Spending is currently within a healthy range relative to the estimate.")
      );
    }

    setCostInsightLoading(false);
  }

  async function generateProjectInsight() {
    setProjectInsightLoading(true);
    setProjectInsight("");
    setProjectInsightMode(null);

    const context = {
      totalSiteRecords: siteData.length,
      safetyCount,
      incidentsCount: incidents.length,
      highRiskIncidents: highRiskIncidents.length,
      materialsCount: materials.length,
      lowStockMaterials: lowStockMaterials.map((m) => ({ name: m.material_name, area: m.area, status: m.status })),
      recurringIssues,
      attentionAreas,
    };

    try {
      const res = await fetch("/api/ai-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insightType: "project", context }),
      });
      const json = await res.json();
      if (!res.ok || json.error || !json.result) throw new Error(json.error || "unavailable");

      setProjectInsight(json.result);
      setProjectInsightMode("real-ai");
    } catch {
      setProjectInsightMode("rule-based");
      setProjectInsight(
        `• Total stored site records: ${siteData.length} (${safetyCount} safety-related)\n` +
          `• Open incidents: ${openIncidents.length} (${highRiskIncidents.length} high severity)\n` +
          `• Materials needing attention: ${lowStockMaterials.length} of ${materials.length}\n` +
          `• Recurring issue patterns: ${recurringIssues.length}\n` +
          (attentionAreas[0]
            ? `• Top area needing attention: ${attentionAreas[0].area} — ${attentionAreas[0].reason}`
            : "• No area currently shows elevated risk.")
      );
    }

    setProjectInsightLoading(false);
  }

  async function generateProgressInsight() {
    setProgressInsightLoading(true);
    setProgressInsight("");
    setProgressInsightMode(null);

    const context = {
      progressPercent: currentProject?.progress_percent || 0,
      totalReports: reports.length,
      recentReports: reports.slice(0, 8).map((r) => ({ date: r.report_date, description: r.description })),
      expectedCompletionDate: currentProject?.expected_completion_date || null,
    };

    try {
      const res = await fetch("/api/ai-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insightType: "progress", context }),
      });
      const json = await res.json();
      if (!res.ok || json.error || !json.result) throw new Error(json.error || "unavailable");

      setProgressInsight(json.result);
      setProgressInsightMode("real-ai");
    } catch {
      setProgressInsightMode("rule-based");
      setProgressInsight(
        `• Current tracked progress: ${currentProject?.progress_percent || 0}% (manually tracked estimate)\n` +
          `• Daily progress reports logged: ${reports.length}\n` +
          (reports.length < 3
            ? "• Not enough historical reports yet to assess a delay trend."
            : "• Multiple reports are on file — review them individually for delay mentions; this summary does not infer a trend automatically.")
      );
    }

    setProgressInsightLoading(false);
  }

  // ---------------------------------------------------------------------
  // DATA-DRIVEN AI ASSISTANT — project-scoped, retrieval + template answers
  // over the currently selected project's real data.
  // ---------------------------------------------------------------------
  function handleAskAI() {
    if (!aiQuestion.trim()) {
      setAiAnswer("Please enter a question about the construction project.");
      return;
    }

    const hasAnyData =
      siteData.length > 0 || incidents.length > 0 || materials.length > 0 || reports.length > 0 || costs.length > 0;

    if (!hasAnyData) {
      setAiAnswer("There is no data stored yet for this project. Please add site observations, incidents, materials, or cost entries first.");
      return;
    }

    const question = aiQuestion.toLowerCase();
    const weeksRequested = extractWeeks(question);
    let answer = "";

    if (question.includes("cost") || question.includes("budget")) {
      answer =
        `Cost Status for ${currentProject?.name || "this project"}\n\n` +
        `• Total Estimated: ${formatCurrency(totalEstimatedCost)}\n` +
        `• Total Actual/Spent: ${formatCurrency(totalActualCost)}\n` +
        `• Remaining: ${formatCurrency(remainingCost)}\n` +
        `• Budget Used: ${costUsedPercent}% (${budgetStatus})\n` +
        (costByCategory.length > 0 ? `• Highest cost category: ${topCostCategory}` : "• No cost entries recorded yet.");
    } else if (question.includes("material") || question.includes("stock")) {
      answer =
        lowStockMaterials.length > 0
          ? `${lowStockMaterials.length} material record(s) need attention:\n\n` +
            lowStockMaterials.map((m) => `• ${m.material_name} (${m.area}) — ${m.quantity} ${m.unit} — ${m.status}`).join("\n")
          : materials.length > 0
          ? "No materials are currently marked as low stock or required."
          : "No material records are stored yet.";
    } else if (question.includes("incident") && weeksRequested !== null) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - weeksRequested * 7);
      const recent = incidents.filter((i) => {
        const d = new Date(i.incident_date);
        return !isNaN(d.getTime()) && d >= cutoff;
      });
      answer =
        recent.length > 0
          ? `${recent.length} incident(s) in the last ${weeksRequested} week(s):\n\n` +
            recent.map((i) => `• ${i.area} (${i.incident_date}): ${i.incident_type} — ${i.severity}`).join("\n")
          : `No incidents recorded in the last ${weeksRequested} week(s).`;
    } else if (question.includes("incident") || (question.includes("high") && question.includes("sever"))) {
      answer =
        highRiskIncidents.length > 0
          ? `${highRiskIncidents.length} high-severity incident(s):\n\n` +
            highRiskIncidents
              .map((i) => `• ${i.area} (${i.incident_date}): ${i.incident_type} — ${i.description || "No description"}`)
              .join("\n")
          : `Total incidents recorded: ${incidents.length} (${openIncidents.length} open). None are currently marked High severity.`;
    } else if (question.includes("recurring")) {
      answer =
        recurringIssues.length > 0
          ? "Recurring issues detected:\n\n" +
            recurringIssues
              .map((r) => `• ${r.issueType} repeated ${r.count} times in ${r.area} (highest severity: ${r.maxSeverity})`)
              .join("\n")
          : "No recurring issue patterns detected yet (an issue needs 2+ occurrences in the same area).";
    } else if (question.includes("attention") || question.includes("focus")) {
      answer =
        attentionAreas.length > 0
          ? "Areas needing attention:\n\n" +
            attentionAreas
              .slice(0, 5)
              .map((a) => `• ${a.area} — risk score ${a.score} (${a.reason}). ${a.recommendation}`)
              .join("\n")
          : "No area currently shows elevated risk based on stored data.";
    } else if (question.includes("safety")) {
      const areaMatch = extractArea(question);
      const safetyIssues = siteData.filter(
        (item) => item.issue_type?.toLowerCase().includes("safety") && (!areaMatch || item.area === areaMatch)
      );
      answer =
        safetyIssues.length > 0
          ? `I found ${safetyIssues.length} safety issue(s)${areaMatch ? ` in ${areaMatch}` : ""}:\n\n` +
            safetyIssues.map((item) => `• ${item.area} (${item.date}): ${item.observation}`).join("\n")
          : `No safety issues${areaMatch ? ` in ${areaMatch}` : ""} are currently stored.`;
    } else if (question.includes("area") && (question.includes("most") || question.includes("issue"))) {
      answer = `The area with the most recorded activity is ${topArea}, with ${areas[0]?.[1] || 0} record(s).`;
    } else if (question.includes("latest") || question.includes("recent")) {
      answer =
        "Latest site observations:\n\n" +
        siteData.slice(0, 5).map((item) => `• ${item.area} — ${item.issue_type}: ${item.observation}`).join("\n");
    } else if (question.includes("progress")) {
      const progressIssues = siteData.filter((item) => item.issue_type?.toLowerCase().includes("progress"));
      answer =
        `Current progress: ${currentProject?.progress_percent || 0}% (manually tracked estimate)\n` +
        `Progress-related records found: ${progressIssues.length}.\n\n` +
        (progressIssues.length > 0
          ? progressIssues.map((item) => `• ${item.area} (${item.date}): ${item.observation}`).join("\n")
          : "No progress observations are currently stored.") +
        `\n\nDaily progress reports logged: ${reports.length}.`;
    } else if (question.includes("summar") || question.includes("status") || question.includes("supervisor")) {
      answer =
        `Project Status Summary — ${currentProject?.name || ""}\n\n` +
        `• Total site records: ${siteData.length}\n` +
        `• Safety issues: ${safetyCount}\n` +
        `• Safety incidents: ${incidents.length} (${openIncidents.length} open)\n` +
        `• Materials tracked: ${materials.length}\n` +
        `• Recurring issue patterns: ${recurringIssues.length}\n` +
        `• Budget: ${formatCurrency(totalActualCost)} of ${formatCurrency(totalEstimatedCost)} used (${budgetStatus})\n` +
        `• Top area needing attention: ${attentionAreas[0]?.area || "None currently"}\n\n` +
        (attentionAreas[0]
          ? `Recommended focus: ${attentionAreas[0].area} — ${attentionAreas[0].reason}. ${attentionAreas[0].recommendation}`
          : "No urgent focus area identified from current data.");
    } else {
      answer =
        `I can answer using this project's stored data.\n\n` +
        `Total records: ${siteData.length}\n` +
        `Safety issues: ${safetyCount}\n` +
        `Top area: ${topArea}\n\n` +
        `Try asking about safety issues, incidents, materials, recurring issues, areas needing attention, progress, or cost/budget.`;
    }

    setAiAnswer(answer);
  }

  // =======================================================================
  // RENDER
  // =======================================================================

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      {view === "projects" ? (
        <>
          {/* =============================== PROJECTS LANDING PAGE =============================== */}
          <header className="bg-slate-950 text-white">
            <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-purple-600 flex items-center justify-center text-2xl">
                  🏗️
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Construction Site Intelligence</h1>
                  <p className="text-slate-400 text-sm">
                    Multi-project construction management &amp; site intelligence
                  </p>
                </div>
              </div>
              <button
                onClick={openCreateProjectModal}
                className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-xl font-semibold shadow-lg"
              >
                + New Project
              </button>
            </div>
          </header>

          <div className="max-w-7xl mx-auto px-6 py-8">
            {projects.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 text-center">
                <div className="text-5xl mb-4">🏗️</div>
                <h2 className="text-2xl font-bold mb-2">No projects yet</h2>
                <p className="text-slate-500 mb-6">
                  Create your first construction project to start tracking site data, safety,
                  materials, and cost.
                </p>
                <button
                  onClick={openCreateProjectModal}
                  className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-xl font-semibold"
                >
                  + New Project
                </button>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
                {(projectSummaries.length > 0 ? projectSummaries : projects).map((p: any) => {
                  const used = p.totalEstimated > 0 ? Math.round((p.totalActual / p.totalEstimated) * 100) : 0;
                  return (
                    <button
                      key={p.id}
                      onClick={() => selectProject(p.id)}
                      className="text-left bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg hover:border-purple-200 transition p-6"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-bold">{p.name}</h3>
                          <p className="text-sm text-slate-500 mt-1">{p.location}</p>
                        </div>
                        <span
                          className={`text-xs px-2 py-1 rounded-full font-semibold whitespace-nowrap ${
                            p.status === "Active"
                              ? "bg-green-100 text-green-700"
                              : p.status === "Completed"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {p.status}
                        </span>
                      </div>

                      {p.client_name && (
                        <p className="text-xs text-slate-400 mt-2">Client: {p.client_name}</p>
                      )}

                      <div className="flex items-center justify-between text-xs text-slate-400 mt-2">
                        <span>{p.start_date ? `Start: ${p.start_date}` : ""}</span>
                        <span>{p.expected_completion_date ? `Due: ${p.expected_completion_date}` : ""}</span>
                      </div>

                      <div className="mt-4">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-500">Progress</span>
                          <span className="font-semibold">{p.progress_percent || 0}%</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2.5">
                          <div
                            className="bg-green-600 h-2.5 rounded-full"
                            style={{ width: `${p.progress_percent || 0}%` }}
                          />
                        </div>
                      </div>

                      {"totalEstimated" in p && (
                        <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                          <div className="bg-slate-50 rounded-lg p-2">
                            <p className="text-[10px] text-slate-400">Estimated</p>
                            <p className="text-xs font-bold">{formatCurrency(p.totalEstimated)}</p>
                          </div>
                          <div className="bg-slate-50 rounded-lg p-2">
                            <p className="text-[10px] text-slate-400">Spent ({used}%)</p>
                            <p className="text-xs font-bold">{formatCurrency(p.totalActual)}</p>
                          </div>
                          <div className="bg-slate-50 rounded-lg p-2">
                            <p className="text-[10px] text-slate-400">Remaining</p>
                            <p className="text-xs font-bold">{formatCurrency(p.remainingBudget)}</p>
                          </div>
                        </div>
                      )}

                      {"activeIssues" in p && (
                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                          <span className="text-xs text-slate-500">Active issues</span>
                          <span
                            className={`text-xs px-2 py-1 rounded-full font-bold ${
                              p.activeIssues > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                            }`}
                          >
                            {p.activeIssues}
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* =============================== PROJECT DASHBOARD =============================== */}
          <header className="bg-slate-950 text-white">
            <div className="max-w-7xl mx-auto px-6 py-5">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <button
                  onClick={() => setView("projects")}
                  className="text-sm text-slate-300 hover:text-white flex items-center gap-1"
                >
                  ← Back to Projects
                </button>
                <span className="text-slate-600">/</span>
                <select
                  value={selectedProjectId ?? ""}
                  onChange={(e) => selectProject(Number(e.target.value))}
                  className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id} className="text-slate-900">
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={openCreateProjectModal}
                  className="text-sm bg-purple-600 hover:bg-purple-500 px-3 py-1.5 rounded-lg font-semibold"
                >
                  + New Project
                </button>
              </div>

              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-purple-600 flex items-center justify-center text-xl">
                    🏗️
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold">{currentProject?.name || "Construction Project"}</h1>
                    <p className="text-slate-400 text-sm">
                      {currentProject?.location}
                      {currentProject?.client_name ? ` · Client: ${currentProject.client_name}` : ""}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2.5 rounded-xl font-semibold text-sm"
                  >
                    + Site Data
                  </button>
                  <button
                    onClick={() => setShowReport(true)}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl font-semibold text-sm"
                  >
                    + Progress
                  </button>
                  <button
                    onClick={() => setShowIncidentModal(true)}
                    className="bg-red-600 hover:bg-red-500 text-white px-4 py-2.5 rounded-xl font-semibold text-sm"
                  >
                    + Incident
                  </button>
                  <button
                    onClick={() => setShowMaterialModal(true)}
                    className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2.5 rounded-xl font-semibold text-sm"
                  >
                    + Material
                  </button>
                  <button
                    onClick={() => setShowCostModal(true)}
                    className="bg-teal-600 hover:bg-teal-500 text-white px-4 py-2.5 rounded-xl font-semibold text-sm"
                  >
                    + Cost Entry
                  </button>
                  <button
                    onClick={openEditProjectModal}
                    className="border border-white/20 hover:bg-white/10 px-4 py-2.5 rounded-xl font-semibold text-sm"
                  >
                    Edit Project
                  </button>
                </div>
              </div>
            </div>
          </header>

          <div className="max-w-7xl mx-auto px-6 py-8">
            {/* KPI CARDS */}
            <section className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-7">
              <div className="bg-white rounded-2xl p-4 border border-green-100 shadow-sm">
                <p className="text-xs text-slate-500">Overall Progress</p>
                <p className="text-2xl font-bold mt-1 text-green-600">
                  {currentProject?.progress_percent || 0}%
                </p>
                <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
                  <div
                    className="bg-green-600 h-2 rounded-full"
                    style={{ width: `${currentProject?.progress_percent || 0}%` }}
                  />
                </div>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-red-100 shadow-sm">
                <p className="text-xs text-slate-500">Safety Issues</p>
                <p className="text-2xl font-bold mt-1 text-red-600">{safetyCount}</p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-red-100 shadow-sm">
                <p className="text-xs text-slate-500">Open Incidents</p>
                <p className="text-2xl font-bold mt-1 text-red-600">{openIncidents.length}</p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-orange-100 shadow-sm">
                <p className="text-xs text-slate-500">Material Alerts</p>
                <p className="text-2xl font-bold mt-1 text-orange-600">{lowStockMaterials.length}</p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-amber-100 shadow-sm">
                <p className="text-xs text-slate-500">Budget Used</p>
                <p className="text-2xl font-bold mt-1 text-amber-600">{costUsedPercent}%</p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                <p className="text-xs text-slate-500">Remaining Budget</p>
                <p className="text-lg font-bold mt-1">{formatCurrency(remainingCost)}</p>
              </div>
            </section>

            {/* SECONDARY STATS */}
            <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-7">
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                <p className="text-sm text-slate-500">Total Site Records</p>
                <p className="text-3xl font-bold mt-2">{siteData.length}</p>
              </div>
              <div className="bg-white rounded-2xl p-5 border border-purple-100 shadow-sm">
                <p className="text-sm text-slate-500">AI Observations</p>
                <p className="text-3xl font-bold mt-2 text-purple-600">
                  {aiObservationCount === null ? "—" : aiObservationCount}
                </p>
                <p className="text-xs text-purple-400 mt-2">Real + demo photo analysis runs</p>
              </div>
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                <p className="text-sm text-slate-500">Materials Tracked</p>
                <p className="text-3xl font-bold mt-2">{materials.length}</p>
              </div>
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                <p className="text-sm text-slate-500">Recurring Issues</p>
                <p className="text-3xl font-bold mt-2">{recurringIssues.length}</p>
              </div>
            </section>

            {/* COST ANALYSIS */}
            <section className="mb-7">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-teal-600 font-semibold">
                      Budget tracking
                    </p>
                    <h2 className="text-xl font-bold mt-1">Cost Analysis</h2>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${budgetStatusColor}`}>
                      {budgetStatus}
                    </span>
                    <button
                      onClick={() => setShowCostModal(true)}
                      className="bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded-xl text-sm font-semibold"
                    >
                      + Add Cost Entry
                    </button>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="bg-slate-50 rounded-xl p-4">
                    <p className="text-xs text-slate-500">Total Estimated</p>
                    <p className="text-xl font-bold mt-1">{formatCurrency(totalEstimatedCost)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4">
                    <p className="text-xs text-slate-500">Total Actual/Spent</p>
                    <p className="text-xl font-bold mt-1">{formatCurrency(totalActualCost)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4">
                    <p className="text-xs text-slate-500">Remaining</p>
                    <p className="text-xl font-bold mt-1">{formatCurrency(remainingCost)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4">
                    <p className="text-xs text-slate-500">Budget Used</p>
                    <p className="text-xl font-bold mt-1">{costUsedPercent}%</p>
                  </div>
                </div>

                {costByCategory.length > 0 && (
                  <div className="mb-6">
                    <p className="text-sm font-semibold mb-3">Cost by Category — Estimated vs Actual</p>
                    <div className="space-y-3">
                      {costByCategory.map((c) => (
                        <div key={c.category}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-medium">{c.category}</span>
                            <span className="text-slate-500">
                              {formatCurrency(c.actual)} / {formatCurrency(c.estimated)} est.
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2 mb-1">
                            <div
                              className="bg-slate-300 h-2 rounded-full"
                              style={{ width: `${(c.estimated / maxCostValue) * 100}%` }}
                            />
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                c.actual > c.estimated ? "bg-red-500" : "bg-teal-600"
                              }`}
                              style={{ width: `${(c.actual / maxCostValue) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-teal-50 border border-teal-100 rounded-xl p-4 mb-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-semibold text-teal-800">AI Cost Insight</p>
                      <p className="text-xs text-teal-600">
                        Uses a real LLM call over your cost data when configured, otherwise a labeled
                        rule-based summary.
                      </p>
                    </div>
                    <button
                      onClick={generateCostInsight}
                      disabled={costInsightLoading}
                      className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold"
                    >
                      {costInsightLoading ? "Analyzing..." : "Generate Insight"}
                    </button>
                  </div>
                  {costInsight && (
                    <div className="mt-3 bg-white rounded-lg p-4 text-sm">
                      <span
                        className={`inline-block mb-2 text-xs px-2 py-1 rounded-full font-bold ${
                          costInsightMode === "real-ai" ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {costInsightMode === "real-ai" ? "✓ Real AI Insight" : "Rule-Based Insight"}
                      </span>
                      <p className="whitespace-pre-line">{costInsight}</p>
                    </div>
                  )}
                </div>

                {costs.length === 0 ? (
                  <p className="text-slate-500 text-center py-6">
                    No cost entries yet. (If this persists, run supabase/migration_v2_projects_and_costs.sql.)
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold mb-2">Recent Expenses</p>
                    {costs.slice(0, 8).map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-3"
                      >
                        <div>
                          <p className="font-medium text-sm">
                            {c.category} {c.area ? `— ${c.area}` : ""}
                          </p>
                          <p className="text-xs text-slate-400">
                            {c.date} {c.description ? `· ${c.description}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold">{formatCurrency(c.actual_cost)}</span>
                          <button
                            onClick={() => deleteCost(c.id)}
                            className="text-red-600 hover:text-red-700 text-xs font-semibold"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* SAFETY & RISK */}
            <section className="grid lg:grid-cols-2 gap-6 mb-7">
              <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-red-500">
                      Safety monitoring
                    </p>
                    <h2 className="text-xl font-bold mt-1">Active Safety Alerts</h2>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center text-xl">
                    🚨
                  </div>
                </div>

                {safetyCount > 0 ? (
                  <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                    <p className="font-semibold text-red-700">{safetyCount} safety issue(s) detected</p>
                    <p className="text-sm text-red-600 mt-1">
                      Review recent observations and ensure corrective action is taken.
                    </p>
                  </div>
                ) : (
                  <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                    <p className="font-semibold text-green-700">No active safety issues</p>
                    <p className="text-sm text-green-600 mt-1">No safety issues are currently stored.</p>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-purple-600">
                      Site intelligence
                    </p>
                    <h2 className="text-xl font-bold mt-1">Area Activity</h2>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-purple-50 flex items-center justify-center text-xl">
                    📍
                  </div>
                </div>

                {areas.length > 0 ? (
                  <div className="space-y-3">
                    {areas.slice(0, 4).map(([area, count]) => (
                      <div key={area} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                        <span className="font-medium">{area}</span>
                        <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-bold">
                          {count} record{count !== 1 ? "s" : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500">No area activity yet.</p>
                )}
              </div>
            </section>

            {/* RECURRING ISSUES + AREAS NEEDING ATTENTION */}
            <section className="grid lg:grid-cols-2 gap-6 mb-7">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Pattern detection
                    </p>
                    <h2 className="text-xl font-bold mt-1">Recurring Issues</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      Same issue type repeated 2+ times in the same area
                    </p>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-xl">
                    🔁
                  </div>
                </div>

                {recurringIssues.length === 0 ? (
                  <p className="text-slate-500 py-6 text-center">No recurring patterns detected yet.</p>
                ) : (
                  <div className="space-y-3">
                    {recurringIssues.slice(0, 6).map((r) => (
                      <div key={`${r.area}-${r.issueType}`} className="bg-slate-50 rounded-xl px-4 py-3">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">
                            {r.issueType} — {r.area}
                          </span>
                          <span className="bg-slate-800 text-white px-2 py-1 rounded-full text-xs font-bold">
                            ×{r.count}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">Highest severity seen: {r.maxSeverity}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Risk scoring</p>
                    <h2 className="text-xl font-bold mt-1">Areas Needing Attention</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      Score = safety issues + incidents + recurrence, weighted
                    </p>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-xl">
                    🎯
                  </div>
                </div>

                {attentionAreas.length === 0 ? (
                  <p className="text-slate-500 py-6 text-center">No area currently shows elevated risk.</p>
                ) : (
                  <div className="space-y-3">
                    {attentionAreas.slice(0, 6).map((a) => (
                      <div key={a.area} className="bg-slate-50 rounded-xl px-4 py-3">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{a.area}</span>
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-bold ${
                              a.score >= 10
                                ? "bg-red-600 text-white"
                                : a.score >= 5
                                ? "bg-amber-500 text-white"
                                : "bg-slate-300 text-slate-800"
                            }`}
                          >
                            Score {a.score}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{a.reason}</p>
                        <p className="text-xs text-slate-700 font-medium mt-1">{a.recommendation}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* AI PROJECT INSIGHTS + PROGRESS INSIGHTS */}
            <section className="grid lg:grid-cols-2 gap-6 mb-7">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-purple-600 font-semibold">
                      AI insights
                    </p>
                    <h2 className="text-xl font-bold mt-1">Project Insights</h2>
                  </div>
                  <button
                    onClick={generateProjectInsight}
                    disabled={projectInsightLoading}
                    className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold"
                  >
                    {projectInsightLoading ? "Analyzing..." : "Generate"}
                  </button>
                </div>
                {projectInsight ? (
                  <div className="bg-slate-50 rounded-xl p-4 text-sm">
                    <span
                      className={`inline-block mb-2 text-xs px-2 py-1 rounded-full font-bold ${
                        projectInsightMode === "real-ai" ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {projectInsightMode === "real-ai" ? "✓ Real AI Insight" : "Rule-Based Insight"}
                    </span>
                    <p className="whitespace-pre-line">{projectInsight}</p>
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">
                    Click Generate for an AI summary of safety, materials, and recurring issues from real data.
                  </p>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-blue-600 font-semibold">AI insights</p>
                    <h2 className="text-xl font-bold mt-1">Progress Insights</h2>
                  </div>
                  <button
                    onClick={generateProgressInsight}
                    disabled={progressInsightLoading}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold"
                  >
                    {progressInsightLoading ? "Analyzing..." : "Generate"}
                  </button>
                </div>
                {progressInsight ? (
                  <div className="bg-slate-50 rounded-xl p-4 text-sm">
                    <span
                      className={`inline-block mb-2 text-xs px-2 py-1 rounded-full font-bold ${
                        progressInsightMode === "real-ai" ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {progressInsightMode === "real-ai" ? "✓ Real AI Insight" : "Rule-Based Insight"}
                    </span>
                    <p className="whitespace-pre-line">{progressInsight}</p>
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">
                    Click Generate for an AI summary of progress reports. Will not guess a delay trend
                    without enough historical data.
                  </p>
                )}
              </div>
            </section>

            {/* RECENT AI-ANALYZED PHOTOS */}
            <section className="mb-7">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-purple-600 font-semibold">
                      AI monitoring
                    </p>
                    <h2 className="text-xl font-bold mt-1">Recent AI-Analyzed Records</h2>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-purple-50 flex items-center justify-center text-xl">
                    🤖
                  </div>
                </div>

                {siteData.filter((s) => s.photo_url).length === 0 ? (
                  <div className="text-center py-10 text-slate-500">No AI-analyzed photos yet.</div>
                ) : (
                  <div className="grid md:grid-cols-3 gap-5">
                    {siteData
                      .filter((s) => s.photo_url)
                      .slice(0, 3)
                      .map((item) => (
                        <div
                          key={item.id}
                          className="border border-slate-200 rounded-2xl overflow-hidden hover:shadow-md transition"
                        >
                          <img
                            src={item.photo_url as string}
                            alt={item.photo_name || "Construction site"}
                            className="w-full h-44 object-cover"
                          />
                          <div className="p-4">
                            <div className="flex items-center justify-between gap-2">
                              <h3 className="font-bold text-sm">{item.issue_type}</h3>
                              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
                                {item.severity || "Medium"}
                              </span>
                            </div>
                            <p className="text-sm text-slate-600 mt-3 leading-6 line-clamp-3">
                              {item.observation}
                            </p>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </section>

            {/* MATERIALS */}
            <section className="mb-7">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-amber-600 font-semibold">Inventory</p>
                    <h2 className="text-xl font-bold mt-1">Materials</h2>
                  </div>
                  <button
                    onClick={() => setShowMaterialModal(true)}
                    className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-xl text-sm font-semibold"
                  >
                    + Add Material
                  </button>
                </div>

                {materials.length === 0 ? (
                  <p className="text-slate-500 py-6 text-center">No materials tracked yet.</p>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {materials.map((m) => (
                      <div key={m.id} className="border border-slate-200 rounded-xl p-4">
                        <div className="flex justify-between gap-2">
                          <h3 className="font-bold">{m.material_name}</h3>
                          <span
                            className={`text-xs px-2 py-1 rounded-full font-semibold ${
                              m.status?.toLowerCase().includes("low") || m.status?.toLowerCase().includes("required")
                                ? "bg-orange-100 text-orange-700"
                                : m.status?.toLowerCase() === "delivered"
                                ? "bg-green-100 text-green-700"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {m.status}
                          </span>
                        </div>
                        <p className="text-sm text-slate-500 mt-1">{m.area}</p>
                        <p className="text-sm text-slate-700 mt-2 font-semibold">
                          {m.quantity} {m.unit}
                        </p>
                        <button
                          onClick={() => deleteMaterial(m.id)}
                          className="text-red-600 hover:text-red-700 text-xs font-semibold mt-3"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* SAFETY INCIDENTS */}
            <section className="mb-7">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-red-600 font-semibold">Incident log</p>
                    <h2 className="text-xl font-bold mt-1">Safety Incidents</h2>
                  </div>
                  <button
                    onClick={() => setShowIncidentModal(true)}
                    className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-xl text-sm font-semibold"
                  >
                    + Add Incident
                  </button>
                </div>

                {incidents.length === 0 ? (
                  <p className="text-slate-500 py-6 text-center">No safety incidents recorded yet.</p>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {incidents.map((i) => (
                      <div key={i.id} className="border border-slate-200 rounded-xl p-4">
                        <div className="flex justify-between gap-2">
                          <h3 className="font-bold">{i.incident_type}</h3>
                          <span
                            className={`text-xs px-2 py-1 rounded-full font-semibold ${
                              i.severity?.toLowerCase() === "high"
                                ? "bg-red-100 text-red-700"
                                : i.severity?.toLowerCase() === "low"
                                ? "bg-slate-100 text-slate-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {i.severity}
                          </span>
                        </div>
                        <p className="text-sm text-slate-500 mt-1">
                          {i.area} — {i.incident_date} · {i.status || "Open"}
                        </p>
                        {i.description && <p className="text-sm text-slate-600 mt-2 leading-6">{i.description}</p>}
                        <button
                          onClick={() => deleteIncident(i.id)}
                          className="text-red-600 hover:text-red-700 text-xs font-semibold mt-3"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* AI ASSISTANT */}
            <section className="mb-7">
              <div className="bg-slate-950 text-white rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-11 h-11 rounded-xl bg-purple-600 flex items-center justify-center text-xl">
                    🤖
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-purple-300 font-semibold">
                      Data-based project intelligence
                    </p>
                    <h2 className="text-xl font-bold mt-1">Construction AI Assistant</h2>
                    <p className="text-sm text-slate-400 mt-1">
                      Answers use only {currentProject?.name || "this project"}'s stored data.
                    </p>
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-3 mb-5">
                  <button
                    onClick={() => setAiQuestion("Which area needs the most attention?")}
                    className="text-left bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl p-3 text-sm"
                  >
                    🎯 Which area needs the most attention?
                  </button>
                  <button
                    onClick={() => setAiQuestion("What is the current project cost?")}
                    className="text-left bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl p-3 text-sm"
                  >
                    💰 What is the current project cost?
                  </button>
                  <button
                    onClick={() => setAiQuestion("Summarize the current project status.")}
                    className="text-left bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl p-3 text-sm"
                  >
                    📋 Summarize the current project status.
                  </button>
                </div>

                <div className="flex flex-col md:flex-row gap-3">
                  <input
                    type="text"
                    placeholder="Ask anything about this project..."
                    value={aiQuestion}
                    onChange={(e) => setAiQuestion(e.target.value)}
                    className="flex-1 bg-white text-slate-900 border-0 rounded-xl px-4 py-3 outline-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAskAI();
                    }}
                  />
                  <button
                    onClick={handleAskAI}
                    className="bg-purple-600 hover:bg-purple-500 px-7 py-3 rounded-xl font-semibold"
                  >
                    Ask AI →
                  </button>
                </div>

                {aiAnswer && (
                  <div className="mt-5 bg-white rounded-xl p-5 text-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">🤖</span>
                      <p className="font-bold text-purple-700">Data-Based Assistant</p>
                    </div>
                    <p className="text-sm mt-3 whitespace-pre-line leading-6">{aiAnswer}</p>
                  </div>
                )}
              </div>
            </section>

            {/* DAILY PROGRESS REPORTS */}
            {reports.length > 0 && (
              <section className="mb-7">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <p className="text-xs uppercase tracking-wider text-blue-600 font-semibold">Project Reports</p>
                  <h2 className="text-xl font-bold mt-1">Daily Progress Reports</h2>
                  {currentProject?.expected_completion_date && (
                    <p className="text-sm text-slate-500 mt-1">
                      Expected completion: {currentProject.expected_completion_date}
                    </p>
                  )}

                  <div className="grid md:grid-cols-2 gap-4 mt-5">
                    {reports.slice(0, 6).map((report) => (
                      <div key={report.id} className="border border-slate-200 rounded-xl p-4">
                        <div className="flex justify-between gap-3">
                          <h3 className="font-bold">{report.title || "Daily Progress"}</h3>
                          <span className="text-xs text-slate-400">{report.report_date}</span>
                        </div>
                        <p className="text-sm text-slate-600 mt-3 leading-6">{report.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* REPORT EXPORTS */}
            <section className="mb-7">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Export</p>
                <h2 className="text-xl font-bold mt-1">Download Reports (CSV)</h2>
                <p className="text-sm text-slate-500 mt-1 mb-4">Generated from this project's current data.</p>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() =>
                      downloadCSV(
                        `${currentProject?.name || "project"}-site-data.csv`,
                        siteData.map((d) => ({
                          Area: d.area,
                          Date: d.date,
                          Issue_Type: d.issue_type,
                          Severity: d.severity || "Medium",
                          Status: d.status || "Open",
                          Source: d.source || "Manual Entry",
                          Observation: d.observation,
                        }))
                      )
                    }
                    className="border border-slate-300 hover:bg-slate-50 px-4 py-2 rounded-xl text-sm font-semibold"
                  >
                    Site Data Summary
                  </button>

                  <button
                    onClick={() =>
                      downloadCSV(
                        `${currentProject?.name || "project"}-incidents.csv`,
                        incidents.map((i) => ({
                          Area: i.area,
                          Type: i.incident_type,
                          Severity: i.severity,
                          Status: i.status,
                          Date: i.incident_date,
                          Description: i.description || "",
                        }))
                      )
                    }
                    className="border border-slate-300 hover:bg-slate-50 px-4 py-2 rounded-xl text-sm font-semibold"
                  >
                    Safety Incident Summary
                  </button>

                  <button
                    onClick={() =>
                      downloadCSV(
                        `${currentProject?.name || "project"}-recurring-issues.csv`,
                        recurringIssues.map((r) => ({
                          Area: r.area,
                          Issue_Type: r.issueType,
                          Occurrences: r.count,
                          Highest_Severity: r.maxSeverity,
                        }))
                      )
                    }
                    className="border border-slate-300 hover:bg-slate-50 px-4 py-2 rounded-xl text-sm font-semibold"
                  >
                    Recurring Issue Summary
                  </button>

                  <button
                    onClick={() =>
                      downloadCSV(
                        `${currentProject?.name || "project"}-attention-areas.csv`,
                        attentionAreas.map((a) => ({
                          Area: a.area,
                          Risk_Score: a.score,
                          Reason: a.reason,
                          Recommendation: a.recommendation,
                        }))
                      )
                    }
                    className="border border-slate-300 hover:bg-slate-50 px-4 py-2 rounded-xl text-sm font-semibold"
                  >
                    Area Attention Summary
                  </button>

                  <button
                    onClick={() =>
                      downloadCSV(
                        `${currentProject?.name || "project"}-costs.csv`,
                        costs.map((c) => ({
                          Category: c.category,
                          Description: c.description || "",
                          Estimated: c.estimated_cost,
                          Actual: c.actual_cost,
                          Date: c.date,
                          Area: c.area || "",
                        }))
                      )
                    }
                    className="border border-slate-300 hover:bg-slate-50 px-4 py-2 rounded-xl text-sm font-semibold"
                  >
                    Cost Summary
                  </button>
                </div>
              </div>
            </section>

            {/* RECENT SITE DATA / SMART SEARCH */}
            <section className="mb-7">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                      Project database
                    </p>
                    <h2 className="text-xl font-bold mt-1">Recent Site Data</h2>
                  </div>
                  <button
                    onClick={() => selectedProjectId && loadSiteData(selectedProjectId)}
                    className="border border-slate-300 hover:bg-slate-50 px-4 py-2 rounded-xl text-sm font-semibold"
                  >
                    ↻ Refresh
                  </button>
                </div>

                <div className="grid md:grid-cols-4 gap-3 mb-4">
                  <input
                    type="text"
                    placeholder="Search area, issue, observation..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="border border-slate-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-200"
                  />

                  <select
                    value={issueFilter}
                    onChange={(e) => setIssueFilter(e.target.value)}
                    className="border border-slate-300 rounded-xl px-4 py-3"
                  >
                    <option value="All">All Issue Types</option>
                    <option value="Safety Issue">Safety Issue</option>
                    <option value="Quality Issue">Quality Issue</option>
                    <option value="Progress Issue">Progress Issue</option>
                    <option value="Material Issue">Material Issue</option>
                    <option value="Other">Other</option>
                  </select>

                  <select
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                    className="border border-slate-300 rounded-xl px-4 py-3"
                  >
                    <option value="All">All Severities</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>

                  <input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="border border-slate-300 rounded-xl px-4 py-3"
                  />
                </div>

                <button
                  onClick={() => {
                    setSearch("");
                    setIssueFilter("All");
                    setSeverityFilter("All");
                    setDateFilter("");
                  }}
                  className="text-sm text-purple-600 font-semibold mb-5"
                >
                  Clear Filters
                </button>

                {filteredData.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">No matching site data found.</div>
                ) : (
                  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filteredData.map((item) => (
                      <div
                        key={item.id}
                        className="border border-slate-200 rounded-2xl overflow-hidden hover:shadow-md transition"
                      >
                        {item.photo_url ? (
                          <img
                            src={item.photo_url}
                            alt={item.photo_name || "Construction site"}
                            className="w-full h-48 object-cover"
                          />
                        ) : (
                          <div className="w-full h-48 bg-slate-100 flex items-center justify-center text-4xl">
                            🏗️
                          </div>
                        )}

                        <div className="p-5">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="font-bold">{item.area}</h3>
                              <p className="text-xs text-slate-500 mt-1">{item.date}</p>
                            </div>

                            <div className="flex flex-col items-end gap-1">
                              <span
                                className={`text-xs px-2 py-1 rounded-full font-semibold ${
                                  item.issue_type?.toLowerCase().includes("safety")
                                    ? "bg-red-100 text-red-700"
                                    : "bg-purple-100 text-purple-700"
                                }`}
                              >
                                {item.issue_type}
                              </span>
                              <span
                                className={`text-xs px-2 py-1 rounded-full font-semibold ${
                                  (item.severity || "Medium").toLowerCase() === "high"
                                    ? "bg-red-50 text-red-600"
                                    : (item.severity || "Medium").toLowerCase() === "low"
                                    ? "bg-slate-100 text-slate-600"
                                    : "bg-amber-50 text-amber-600"
                                }`}
                              >
                                {item.severity || "Medium"}
                              </span>
                            </div>
                          </div>

                          <p className="text-sm text-slate-600 mt-4 leading-6">{item.observation}</p>

                          <div className="flex items-center justify-between mt-3">
                            <p className="text-xs text-slate-400">
                              {item.source || "Manual Entry"} · {item.status || "Open"}
                            </p>
                            {item.photo_name && (
                              <p className="text-xs text-slate-400 truncate">📷 {item.photo_name}</p>
                            )}
                          </div>

                          <button
                            onClick={() => deleteData(item.id)}
                            className="text-red-600 hover:text-red-700 text-sm font-semibold mt-4"
                          >
                            Delete record
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
      )}

      {/* ADD SITE DATA MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-purple-600 font-semibold">New observation</p>
                <h2 className="text-2xl font-bold mt-1">Add Site Data</h2>
                <p className="text-sm text-slate-500 mt-1">
                  {currentProject ? `Project: ${currentProject.name}` : "Upload construction site information"}
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-9 h-9 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold mb-2">Area</label>
                <input
                  type="text"
                  placeholder="e.g. Area A, Floor 2"
                  value={formData.area}
                  onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Date</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-4 py-3"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Issue Type</label>
                  <select
                    value={formData.issueType}
                    onChange={(e) => setFormData({ ...formData, issueType: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-4 py-3"
                  >
                    <option value="">Select issue type</option>
                    <option value="Safety Issue">Safety Issue</option>
                    <option value="Quality Issue">Quality Issue</option>
                    <option value="Progress Issue">Progress Issue</option>
                    <option value="Material Issue">Material Issue</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Severity</label>
                  <select
                    value={formData.severity}
                    onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-4 py-3"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-4 py-3"
                  >
                    <option value="Open">Open</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Resolved">Resolved</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Source</label>
                  <select
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-4 py-3"
                  >
                    <option value="Manual Entry">Manual Entry</option>
                    <option value="Photo AI Analysis">Photo AI Analysis</option>
                    <option value="Site Inspection">Site Inspection</option>
                    <option value="Supervisor Report">Supervisor Report</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Construction Site Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="w-full border border-slate-300 rounded-xl p-3"
                />
                {photoPreview && (
                  <img
                    src={photoPreview}
                    alt="Preview"
                    className="mt-4 w-full h-56 object-cover rounded-xl border"
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Observation</label>
                <textarea
                  rows={4}
                  placeholder="Describe the site observation..."
                  value={formData.observation}
                  onChange={(e) => setFormData({ ...formData, observation: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3"
                />
              </div>

              <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-purple-800">AI Photo Analysis</p>
                    <p className="text-xs text-purple-600 mt-1">
                      Uses GPT-5 Vision when configured, otherwise a labeled rule-based demo
                    </p>
                  </div>
                  <button
                    onClick={analyzePhoto}
                    disabled={aiAnalyzing}
                    className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold"
                  >
                    {aiAnalyzing ? "Analyzing..." : "Analyze Photo"}
                  </button>
                </div>

                {aiResult && (
                  <div className="mt-4 bg-white rounded-lg p-4 text-sm">
                    <span
                      className={`inline-block mb-2 text-xs px-2 py-1 rounded-full font-bold ${
                        aiMode === "real-vision" ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {aiMode === "real-vision" ? "✓ Real AI Vision Result (GPT-5)" : "Demo / Rule-Based Result"}
                    </span>
                    <p className="whitespace-pre-line">{aiResult}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t flex gap-3 justify-end">
              <button
                onClick={() => setIsModalOpen(false)}
                className="border border-slate-300 px-5 py-3 rounded-xl font-semibold hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-semibold"
              >
                Save Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DAILY PROGRESS REPORT MODAL */}
      {showReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl">
            <h2 className="text-2xl font-bold mb-2">Daily Progress Report</h2>
            <p className="text-slate-500 text-sm mb-5">
              {currentProject ? `Project: ${currentProject.name}` : "Record today's construction progress."}
            </p>
            <textarea
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              placeholder="Enter today's construction progress..."
              className="w-full h-40 border border-slate-300 rounded-xl p-4 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={() => {
                  setReportText("");
                  setShowReport(false);
                }}
                className="px-5 py-2.5 rounded-xl bg-slate-200 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={saveProgressReport}
                className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-semibold"
              >
                Save Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD INCIDENT MODAL */}
      {showIncidentModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <h2 className="text-2xl font-bold mb-2">Report Safety Incident</h2>
            <p className="text-slate-500 text-sm mb-5">
              {currentProject ? `Project: ${currentProject.name}` : "Record a safety incident."}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Area</label>
                <input
                  type="text"
                  value={incidentForm.area}
                  onChange={(e) => setIncidentForm({ ...incidentForm, area: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3"
                  placeholder="e.g. Area B"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Incident Type</label>
                <input
                  type="text"
                  value={incidentForm.incidentType}
                  onChange={(e) => setIncidentForm({ ...incidentForm, incidentType: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3"
                  placeholder="e.g. Fall, Equipment failure, PPE violation"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Severity</label>
                  <select
                    value={incidentForm.severity}
                    onChange={(e) => setIncidentForm({ ...incidentForm, severity: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-4 py-3"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Date</label>
                  <input
                    type="date"
                    value={incidentForm.date}
                    onChange={(e) => setIncidentForm({ ...incidentForm, date: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-4 py-3"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Description</label>
                <textarea
                  rows={3}
                  value={incidentForm.description}
                  onChange={(e) => setIncidentForm({ ...incidentForm, description: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowIncidentModal(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-200 font-semibold"
              >
                Cancel
              </button>
              <button onClick={saveIncident} className="px-5 py-2.5 rounded-xl bg-red-600 text-white font-semibold">
                Save Incident
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD MATERIAL MODAL */}
      {showMaterialModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <h2 className="text-2xl font-bold mb-2">Add Material Record</h2>
            <p className="text-slate-500 text-sm mb-5">
              {currentProject ? `Project: ${currentProject.name}` : "Track material inventory by area."}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Area</label>
                <input
                  type="text"
                  value={materialForm.area}
                  onChange={(e) => setMaterialForm({ ...materialForm, area: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3"
                  placeholder="e.g. Area A"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Material Name</label>
                <input
                  type="text"
                  value={materialForm.materialName}
                  onChange={(e) => setMaterialForm({ ...materialForm, materialName: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3"
                  placeholder="e.g. Cement bags"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Quantity</label>
                  <input
                    type="number"
                    value={materialForm.quantity}
                    onChange={(e) => setMaterialForm({ ...materialForm, quantity: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-4 py-3"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Unit</label>
                  <input
                    type="text"
                    value={materialForm.unit}
                    onChange={(e) => setMaterialForm({ ...materialForm, unit: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-4 py-3"
                    placeholder="bags, tons, units..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Status</label>
                <select
                  value={materialForm.status}
                  onChange={(e) => setMaterialForm({ ...materialForm, status: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3"
                >
                  <option value="Available">Available</option>
                  <option value="Low Stock">Low Stock</option>
                  <option value="Required">Required</option>
                  <option value="Delivered">Delivered</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowMaterialModal(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-200 font-semibold"
              >
                Cancel
              </button>
              <button onClick={saveMaterial} className="px-5 py-2.5 rounded-xl bg-amber-600 text-white font-semibold">
                Save Material
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD COST ENTRY MODAL */}
      {showCostModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <h2 className="text-2xl font-bold mb-2">Add Cost Entry</h2>
            <p className="text-slate-500 text-sm mb-5">
              {currentProject ? `Project: ${currentProject.name}` : "Track a project cost."}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Category</label>
                <select
                  value={costForm.category}
                  onChange={(e) => setCostForm({ ...costForm, category: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3"
                >
                  {COST_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Description</label>
                <input
                  type="text"
                  value={costForm.description}
                  onChange={(e) => setCostForm({ ...costForm, description: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3"
                  placeholder="e.g. Cement delivery batch 3"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Estimated Cost</label>
                  <input
                    type="number"
                    value={costForm.estimatedCost}
                    onChange={(e) => setCostForm({ ...costForm, estimatedCost: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-4 py-3"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Actual Cost</label>
                  <input
                    type="number"
                    value={costForm.actualCost}
                    onChange={(e) => setCostForm({ ...costForm, actualCost: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-4 py-3"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Date</label>
                  <input
                    type="date"
                    value={costForm.date}
                    onChange={(e) => setCostForm({ ...costForm, date: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-4 py-3"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Area (optional)</label>
                  <input
                    type="text"
                    value={costForm.area}
                    onChange={(e) => setCostForm({ ...costForm, area: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-4 py-3"
                    placeholder="e.g. Area A"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCostModal(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-200 font-semibold"
              >
                Cancel
              </button>
              <button onClick={saveCost} className="px-5 py-2.5 rounded-xl bg-teal-600 text-white font-semibold">
                Save Cost Entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT PROJECT MODAL */}
      {showProjectModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-2">
              {projectModalMode === "create" ? "New Project" : "Edit Project"}
            </h2>
            <p className="text-slate-500 text-sm mb-5">
              {projectModalMode === "create"
                ? "Create a new, fully independent construction project."
                : "Update this project's details."}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Project Name</label>
                <input
                  type="text"
                  value={projectForm.name}
                  onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3"
                  placeholder="e.g. School Construction"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Location</label>
                <input
                  type="text"
                  value={projectForm.location}
                  onChange={(e) => setProjectForm({ ...projectForm, location: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Client Name</label>
                <input
                  type="text"
                  value={projectForm.clientName}
                  onChange={(e) => setProjectForm({ ...projectForm, clientName: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Start Date</label>
                  <input
                    type="date"
                    value={projectForm.startDate}
                    onChange={(e) => setProjectForm({ ...projectForm, startDate: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-4 py-3"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Expected Completion</label>
                  <input
                    type="date"
                    value={projectForm.expectedCompletionDate}
                    onChange={(e) => setProjectForm({ ...projectForm, expectedCompletionDate: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-4 py-3"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Status</label>
                <select
                  value={projectForm.status}
                  onChange={(e) => setProjectForm({ ...projectForm, status: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3"
                >
                  <option value="Active">Active</option>
                  <option value="On Hold">On Hold</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowProjectModal(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-200 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={saveProjectInfo}
                className="px-5 py-2.5 rounded-xl bg-purple-600 text-white font-semibold"
              >
                {projectModalMode === "create" ? "Create Project" : "Save Project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
