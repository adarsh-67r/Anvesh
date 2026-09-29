"""Course catalogue connectors.

iGOT Karmayogi's APIs need government onboarding, so until credentials exist the platform runs on sample
catalogues shaped like the real sources: NSSTA programmes use NSSTA's own programme categories
(nssta.gov.in -> Trainings), iGOT courses use iGOT-style online modules. Every sample row is flagged `sample`
and shown as such in the app. A real connector only has to implement `fetch()`.
"""

from dataclasses import dataclass, field

from app.competency.framework import BY_ID


@dataclass
class CourseRecord:
    external_id: str
    title: str
    provider: str
    programme: str
    description: str
    mode: str  # online | classroom | blended
    duration_hours: float
    level: int  # level (1-5) the course takes a learner up to
    competencies: list[str] = field(default_factory=list)
    url: str | None = None


class Connector:
    source = ""
    sample = True

    async def fetch(self) -> list[CourseRecord]:
        raise NotImplementedError


def _c(eid, title, provider, programme, desc, mode, hours, level, comps):
    assert all(c in BY_ID for c in comps), comps
    return CourseRecord(eid, title, provider, programme, desc, mode, hours, level, comps)


NSSTA = "NSSTA, MoSPI"
NSSTA_COURSES = [
    _c("sss-ind-survey", "Survey Methodology and Field Operations", NSSTA, "SSS Induction Training",
       "Planning NSS/PLFS-style surveys: questionnaire design, field supervision, non-response and data validation.", "classroom", 30, 3, ["survey_design", "data_quality"]),
    _c("sss-ind-sampling", "Sampling Techniques for Official Surveys", NSSTA, "SSS Induction Training",
       "Stratified, cluster and multi-stage designs; estimation and standard errors as used in NSO surveys.", "classroom", 24, 3, ["sampling"]),
    _c("sss-ref-labour", "Labour Force Statistics: PLFS Concepts and Estimation", NSSTA, "SSS Refresher Training",
       "Usual and current weekly status, LFPR/WPR/UR and PLFS estimation procedures.", "classroom", 18, 3, ["labour_statistics", "survey_design"]),
    _c("sss-ref-price", "Price Statistics: CPI and WPI Compilation", NSSTA, "SSS Refresher Training",
       "Index number theory, basket and weights, price collection and CPI/WPI compilation.", "classroom", 18, 3, ["price_statistics"]),
    _c("sss-ref-asi", "Industrial Statistics: ASI and IIP", NSSTA, "SSS Refresher Training",
       "Annual Survey of Industries concepts, frame, schedules and the Index of Industrial Production.", "classroom", 18, 3, ["industrial_statistics"]),
    _c("iss-prob-na", "National Accounts Statistics: Concepts and Compilation", NSSTA, "ISS Probationary Training",
       "SNA 2008 framework, GDP/GVA by production and expenditure approaches, sources and methods.", "classroom", 40, 4, ["national_accounts"]),
    _c("iss-prob-advsampling", "Advanced Sampling Theory and Variance Estimation", NSSTA, "ISS Probationary Training",
       "Unequal probability sampling, ratio/regression estimators, replication-based variance estimation.", "classroom", 36, 4, ["sampling"]),
    _c("iss-prob-mgmt", "Management, Communication and Office Procedure", NSSTA, "ISS Probationary Training",
       "Leadership basics, noting and drafting, communication of statistics and project planning.", "classroom", 24, 3, ["communication", "leadership", "project_management"]),
    _c("iss-ref-sdg", "Monitoring SDGs with the National Indicator Framework", NSSTA, "ISS Refresher Training",
       "SDG NIF structure, indicator metadata, data flows from ministries and progress reporting.", "blended", 16, 4, ["sdg_indicators", "metadata_standards"]),
    _c("iss-ref-quality", "Data Quality Assurance Framework for Official Statistics", NSSTA, "ISS Refresher Training",
       "National Quality Assurance Framework, quality dimensions, assessment tools and quality reporting.", "blended", 12, 4, ["data_quality", "metadata_standards"]),
    _c("iss-ref-leader", "Leading Statistical Organisations through Change", NSSTA, "ISS Refresher Training",
       "Change management, decision making with evidence, and leading modernisation programmes.", "classroom", 16, 4, ["leadership", "change_management", "decision_making"]),
    _c("jts-ind-ethics", "Fundamental Principles of Official Statistics and Ethics", NSSTA, "JTS Induction Training",
       "UN Fundamental Principles, confidentiality, professional ethics and integrity in official statistics.", "classroom", 8, 3, ["ethics", "data_privacy"]),
    _c("state-agri", "Agricultural Statistics and Crop Estimation Surveys", NSSTA, "State / UT Training",
       "Crop cutting experiments, area estimation, agricultural census and livestock statistics.", "classroom", 24, 3, ["agricultural_statistics", "sampling"]),
    _c("state-sdg-district", "State and District SDG Indicator Frameworks", NSSTA, "State / UT Training",
       "Localising SDGs: state and district indicator frameworks, dashboards and reporting.", "classroom", 12, 3, ["sdg_indicators", "data_visualization"]),
    _c("state-gis", "GIS for State Statistical Bureaus", NSSTA, "State / UT Training",
       "Spatial data, thematic maps and geo-tagging of survey units using QGIS.", "classroom", 18, 3, ["gis"]),
    _c("dbt-python", "Python for Official Statistics", NSSTA, "Demand Based Training",
       "Python and pandas for cleaning, tabulating and analysing survey unit-level data.", "classroom", 24, 3, ["python"]),
    _c("dbt-r", "R for Survey Data Analysis", NSSTA, "Demand Based Training",
       "R and the survey package: weights, design-based estimates and standard errors.", "classroom", 24, 3, ["r", "sampling"]),
    _c("dbt-stata", "Stata for Unit-Level Survey Data", NSSTA, "Demand Based Training",
       "Stata workflows for NSS/PLFS unit-level data, svy commands and reproducible do-files.", "classroom", 18, 3, ["stata"]),
    _c("dbt-spss", "SPSS for Statistical Analysis", NSSTA, "Demand Based Training",
       "Data entry, recoding, cross-tabulation and basic modelling in SPSS.", "classroom", 12, 2, ["spss"]),
    _c("dbt-sas", "SAS for Large Official Datasets", NSSTA, "Demand Based Training",
       "SAS data steps, PROC SQL and PROC SURVEYMEANS for large datasets.", "classroom", 18, 3, ["sas", "sql"]),
    _c("dbt-ml", "Machine Learning Applications in Official Statistics", NSSTA, "Demand Based Training",
       "Classification of occupations/industries, imputation and nowcasting with ML.", "classroom", 30, 3, ["ai_ml", "python"]),
    _c("dbt-bigdata", "Big Data and Cloud for Statistical Production", NSSTA, "Demand Based Training",
       "Using administrative and big data sources; cloud-based processing pipelines.", "classroom", 18, 3, ["cloud_computing", "apis"]),
    _c("web-opendata", "Webinar: eSankhyiki and Open Data Dissemination", NSSTA, "Webinar",
       "Publishing machine-readable statistics, APIs and metadata on eSankhyiki.", "online", 2, 2, ["open_data", "apis", "metadata_standards"]),
    _c("web-dpdp", "Webinar: DPDP Act and Confidentiality of Unit-Level Data", NSSTA, "Webinar",
       "Implications of the Digital Personal Data Protection Act for survey microdata and anonymisation.", "online", 2, 2, ["data_privacy"]),
]

IGOT = "iGOT Karmayogi"
IGOT_COURSES = [
    _c("cyber-basics", "Cyber Security Awareness for Government Employees", "MeitY / CERT-In", "Digital Governance",
       "Phishing, passwords, secure email and incident reporting for government staff.", "online", 3, 2, ["cybersecurity"]),
    _c("cyber-adv", "Information Security Management in Government Systems", "MeitY / CERT-In", "Digital Governance",
       "Risk assessment, security audits and guidelines for government IT systems.", "online", 8, 4, ["cybersecurity", "government_cloud"]),
    _c("data-privacy", "Data Protection and Privacy in Public Administration", IGOT, "Digital Governance",
       "Privacy principles, consent, data minimisation and the DPDP Act.", "online", 4, 3, ["data_privacy"]),
    _c("esign-eoffice", "e-Office, e-Sign and Digital Signatures", "NIC", "Digital Governance",
       "Working in e-Office, digital signature certificates and e-Sign workflows.", "online", 3, 3, ["digital_signatures"]),
    _c("meghraj", "Cloud Computing and MeghRaj for Government", "MeitY", "Digital Governance",
       "Cloud service models, MeghRaj empanelled services and cloud adoption policy.", "online", 5, 3, ["government_cloud", "cloud_computing"]),
    _c("dpi", "Digital Public Infrastructure: India Stack", IGOT, "Digital Governance",
       "Aadhaar, UPI, DigiLocker, consent-based data sharing and building on DPI.", "online", 4, 3, ["dpi", "apis"]),
    _c("data-literacy", "Data Literacy for Decision Makers", IGOT, "Data & Emerging Tech",
       "Reading charts and statistics, data-driven decisions and common pitfalls.", "online", 4, 2, ["data_visualization", "decision_making"]),
    _c("dataviz", "Data Visualisation and Dashboards", IGOT, "Data & Emerging Tech",
       "Designing clear charts and dashboards for policy audiences.", "online", 6, 3, ["data_visualization", "communication"]),
    _c("ai-gov", "AI for Public Servants", IGOT, "Data & Emerging Tech",
       "What AI and ML can and cannot do, responsible AI and use cases in government.", "online", 5, 2, ["ai_ml", "ethics"]),
    _c("genai", "Generative AI in Government Workflows", IGOT, "Data & Emerging Tech",
       "Using LLM tools safely for drafting, summarising and analysis.", "online", 4, 2, ["ai_ml", "data_privacy"]),
    _c("python-intro", "Introduction to Python Programming", IGOT, "Data & Emerging Tech",
       "Python basics: variables, control flow, functions and working with files.", "online", 10, 2, ["python"]),
    _c("sql-intro", "Databases and SQL Fundamentals", IGOT, "Data & Emerging Tech",
       "Relational data, SELECT/JOIN/GROUP BY and good database practice.", "online", 8, 3, ["sql"]),
    _c("open-data", "Open Government Data Platform (data.gov.in)", "NIC", "Data & Emerging Tech",
       "Publishing and consuming open government datasets and APIs.", "online", 3, 2, ["open_data", "apis"]),
    _c("pm", "Project Management for Government Programmes", IGOT, "Behavioural",
       "Scoping, scheduling, risk and monitoring of government projects.", "online", 6, 3, ["project_management"]),
    _c("comm", "Effective Communication in Government", IGOT, "Behavioural",
       "Written and oral communication, presentations and stakeholder engagement.", "online", 4, 3, ["communication"]),
    _c("leader", "Leadership Development for Mid-Career Officers", IGOT, "Behavioural",
       "Leading teams, motivation, delegation and accountability.", "online", 6, 3, ["leadership"]),
    _c("ethics", "Ethics and Integrity in Public Service", IGOT, "Behavioural",
       "Ethical dilemmas, conflict of interest and the conduct rules.", "online", 3, 3, ["ethics"]),
    _c("decisions", "Evidence-Based Policy and Decision Making", IGOT, "Behavioural",
       "Using evidence and data in policy choices; cost-benefit thinking.", "online", 5, 3, ["decision_making"]),
    _c("change", "Managing Change in Public Organisations", IGOT, "Behavioural",
       "Driving adoption of new processes and technology in government.", "online", 4, 3, ["change_management"]),
    _c("mission-kg", "Mission Karmayogi: Competency-Driven Capacity Building", IGOT, "Behavioural",
       "The FRAC competency framework, learning pathways and iGOT features.", "online", 2, 1, ["change_management", "leadership"]),
]


class SampleNsstaConnector(Connector):
    source = "nssta"

    async def fetch(self) -> list[CourseRecord]:
        return NSSTA_COURSES


class SampleIgotConnector(Connector):
    source = "igot"

    async def fetch(self) -> list[CourseRecord]:
        return IGOT_COURSES


CONNECTORS: list[Connector] = [SampleIgotConnector(), SampleNsstaConnector()]
