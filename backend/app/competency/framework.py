"""Competency framework for India's Official Statistical System (PS 26101).

Domains and competencies follow the problem statement; roles follow MoSPI cadres
(Subordinate Statistical Service, Indian Statistical Service, State/UT statistical bureaus).
Levels are 1-5 (1 = awareness, 3 = independent practitioner, 5 = expert / can train others).
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Competency:
    id: str
    name: str
    domain: str
    description: str
    prerequisites: tuple[str, ...] = field(default_factory=tuple)
    keywords: tuple[str, ...] = field(default_factory=tuple)  # used to read qualifications / past trainings


DOMAINS = {
    "statistical": "Statistical",
    "technical": "Technical",
    "digital": "Digital Governance",
    "behavioural": "Behavioural & Managerial",
}

_C = Competency
COMPETENCIES: list[Competency] = [
    # Statistical
    _C("survey_design", "Survey Design", "statistical", "Questionnaire design, survey planning and field operations.", (), ("survey", "questionnaire", "nss", "plfs", "fieldwork")),
    _C("sampling", "Sampling", "statistical", "Sampling designs, estimation and sampling errors.", ("survey_design",), ("sampling", "sample", "estimation")),
    _C("national_accounts", "National Accounts", "statistical", "GDP/GVA compilation, SNA 2008, base revision.", ("sampling",), ("national accounts", "gdp", "gva", "sna")),
    _C("price_statistics", "Price Statistics", "statistical", "CPI, WPI, index number construction.", ("sampling",), ("cpi", "wpi", "price index", "inflation", "index number")),
    _C("labour_statistics", "Labour Statistics", "statistical", "Employment and labour-force surveys (PLFS).", ("survey_design",), ("labour", "employment", "plfs", "unemployment")),
    _C("agricultural_statistics", "Agricultural Statistics", "statistical", "Crop estimation, agricultural census, livestock statistics.", ("sampling",), ("agricultur", "crop", "livestock")),
    _C("industrial_statistics", "Industrial Statistics", "statistical", "ASI, IIP and enterprise surveys.", ("sampling",), ("industrial", "asi", "iip", "enterprise")),
    _C("sdg_indicators", "SDG Indicators", "statistical", "SDG National Indicator Framework and monitoring.", ("metadata_standards",), ("sdg", "sustainable development")),
    _C("metadata_standards", "Metadata Standards", "statistical", "SDMX, DDI and statistical metadata documentation.", (), ("metadata", "sdmx", "ddi")),
    _C("data_quality", "Data Quality Frameworks", "statistical", "NQAF, quality assessment and validation of official data.", ("metadata_standards",), ("data quality", "nqaf", "validation")),
    # Technical
    _C("python", "Python", "technical", "Python for data processing and analysis.", (), ("python", "pandas")),
    _C("r", "R", "technical", "R for statistical computing.", (), (" r ", "r programming", "rstudio")),
    _C("sql", "SQL", "technical", "Querying and managing relational databases.", (), ("sql", "database", "postgres", "oracle")),
    _C("stata", "Stata", "technical", "Stata for survey data analysis.", (), ("stata",)),
    _C("spss", "SPSS", "technical", "SPSS for statistical analysis.", (), ("spss",)),
    _C("sas", "SAS", "technical", "SAS for data management and analytics.", (), ("sas",)),
    _C("gis", "GIS", "technical", "Geospatial data, mapping and spatial analysis.", (), ("gis", "geospatial", "qgis", "arcgis", "remote sensing")),
    _C("data_visualization", "Data Visualization", "technical", "Dashboards and charts for dissemination.", (), ("visuali", "dashboard", "power bi", "tableau")),
    _C("ai_ml", "AI / Machine Learning", "technical", "Machine learning and AI applications in official statistics.", ("python",), ("machine learning", "artificial intelligence", " ai ", "deep learning", "data science")),
    _C("cloud_computing", "Cloud Computing", "technical", "Cloud platforms and big-data processing.", (), ("cloud", "aws", "azure", "big data")),
    _C("apis", "APIs", "technical", "Consuming and publishing data through APIs.", ("python",), ("api", "rest")),
    _C("open_data", "Open Data", "technical", "Open data platforms, licensing and dissemination (eSankhyiki).", ("metadata_standards",), ("open data", "esankhyiki", "data dissemination")),
    # Digital governance
    _C("cybersecurity", "Cybersecurity", "digital", "Security practices for government information systems.", (), ("cyber", "security")),
    _C("data_privacy", "Data Privacy", "digital", "DPDP Act, anonymisation and confidentiality of unit data.", (), ("privacy", "dpdp", "anonymi", "confidential")),
    _C("digital_signatures", "Digital Signatures", "digital", "e-Sign, DSC and e-Office workflows.", (), ("digital signature", "dsc", "e-office", "esign")),
    _C("government_cloud", "Government Cloud", "digital", "MeghRaj / GI Cloud and government hosting norms.", ("cloud_computing",), ("meghraj", "government cloud", "gi cloud")),
    _C("dpi", "Digital Public Infrastructure", "digital", "Aadhaar, UPI, DigiLocker and data exchange platforms.", (), ("digital public infrastructure", "dpi", "aadhaar", "digilocker")),
    # Behavioural & managerial
    _C("leadership", "Leadership", "behavioural", "Leading teams and statistical programmes.", ("communication",), ("leadership", "management")),
    _C("communication", "Communication", "behavioural", "Communicating statistics to policy makers and the public.", (), ("communication", "presentation", "writing")),
    _C("project_management", "Project Management", "behavioural", "Planning and running survey and IT projects.", (), ("project management", "pmp", "planning")),
    _C("ethics", "Ethics", "behavioural", "Professional ethics and the Fundamental Principles of Official Statistics.", (), ("ethics", "integrity")),
    _C("decision_making", "Decision Making", "behavioural", "Evidence-based decisions and policy support.", (), ("decision", "policy")),
    _C("change_management", "Change Management", "behavioural", "Leading adoption of new methods and technology.", ("leadership",), ("change management", "transformation")),
]
BY_ID = {c.id: c for c in COMPETENCIES}


@dataclass(frozen=True)
class Role:
    id: str
    name: str
    cadre: str
    description: str
    requirements: dict[str, int]  # competency id -> required level (1-5)


def _req(**levels: int) -> dict[str, int]:
    unknown = set(levels) - set(BY_ID)
    assert not unknown, unknown
    return levels


ROLES: list[Role] = [
    Role("jso", "Junior Statistical Officer", "SSS", "Field and processing work in NSO surveys (SSS).",
         _req(survey_design=3, sampling=2, labour_statistics=2, price_statistics=2, data_quality=2, sql=1, python=1,
              data_visualization=1, cybersecurity=1, data_privacy=2, ethics=2, communication=2)),
    Role("sso", "Senior Statistical Officer", "SSS", "Supervises survey operations and compilation (SSS).",
         _req(survey_design=3, sampling=3, national_accounts=2, price_statistics=2, labour_statistics=3, industrial_statistics=2,
              data_quality=3, metadata_standards=2, python=2, sql=2, stata=2, data_visualization=2, cybersecurity=2,
              data_privacy=2, communication=2, project_management=2, ethics=3)),
    Role("iss_jts", "ISS Officer (Junior Time Scale)", "ISS", "Assistant Director level; methodology and compilation.",
         _req(survey_design=3, sampling=4, national_accounts=3, price_statistics=3, sdg_indicators=2, metadata_standards=3,
              data_quality=3, python=3, r=2, sql=2, data_visualization=2, ai_ml=1, open_data=2, data_privacy=3,
              communication=3, project_management=2, ethics=3, decision_making=2)),
    Role("iss_sts", "ISS Officer (Deputy Director / Senior Time Scale)", "ISS", "Leads divisions, surveys and releases.",
         _req(sampling=4, national_accounts=4, sdg_indicators=3, metadata_standards=3, data_quality=4, python=3, r=3,
              data_visualization=3, ai_ml=2, cloud_computing=2, apis=2, open_data=3, cybersecurity=2, data_privacy=3,
              government_cloud=2, dpi=2, leadership=3, communication=3, project_management=3, ethics=4,
              decision_making=3, change_management=2)),
    Role("iss_senior", "ISS Officer (Director and above)", "ISS", "Policy support and leadership of statistical programmes.",
         _req(national_accounts=4, sdg_indicators=4, data_quality=4, ai_ml=2, data_visualization=2, cloud_computing=2,
              open_data=3, data_privacy=4, government_cloud=3, dpi=3, leadership=4, communication=4,
              project_management=3, ethics=4, decision_making=4, change_management=4)),
    Role("state_officer", "State / UT Statistical Officer", "State", "Directorate of Economics & Statistics (state/UT).",
         _req(survey_design=3, sampling=3, agricultural_statistics=3, national_accounts=2, price_statistics=2,
              sdg_indicators=3, data_quality=2, sql=1, spss=2, gis=2, data_visualization=2, data_privacy=2,
              communication=2, project_management=2, ethics=3)),
    Role("dpa", "Data Processing / IT Officer", "IT", "Data processing, CAPI systems and dissemination platforms.",
         _req(python=3, sql=4, sas=2, data_visualization=3, cloud_computing=3, apis=3, open_data=3, ai_ml=2, gis=2,
              cybersecurity=4, data_privacy=3, digital_signatures=3, government_cloud=3, dpi=2, metadata_standards=2,
              data_quality=2, project_management=2, ethics=2)),
]
ROLE_BY_ID = {r.id: r for r in ROLES}
