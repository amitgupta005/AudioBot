import argparse
import json
import logging
import uuid

from app.config import SYSTEM_MESSAGE
from app.dependencies import agent


logger = logging.getLogger("cli_chat")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Chat with the backend agent in the terminal.")
    parser.add_argument(
        "--session-id",
        default=f"cli-{uuid.uuid4().hex[:8]}",
        help="Conversation thread ID to use for the LangGraph checkpointer.",
    )
    return parser


def _serialize_state(value):
    if isinstance(value, list):
        return [_serialize_state(item) for item in value]
    if hasattr(value, "type") and hasattr(value, "content"):
        return {"type": value.type, "content": value.content}
    if isinstance(value, dict):
        return {key: _serialize_state(val) for key, val in value.items()}
    return value


def _log_agent_state(config: dict, label: str) -> None:
    checkpointer = getattr(agent, "checkpointer", None)
    if checkpointer is None or not hasattr(checkpointer, "get_tuple"):
        logger.info("%s state unavailable: agent has no readable checkpointer", label)
        return

    checkpoint_tuple = checkpointer.get_tuple(config)
    if not checkpoint_tuple or not checkpoint_tuple.checkpoint:
        logger.info("%s state unavailable: no checkpoint found", label)
        return

    channel_values = checkpoint_tuple.checkpoint.get("channel_values", {})
    logger.info("%s state:\n%s", label, json.dumps(_serialize_state(channel_values), indent=2))

jd_text = """
HR Intern – Job Description
Company: Skilrock Technologies Private Limited
Location: Gurgaon – Unitech Cyber Park Sec - 39
Duration: 3 Months
Department: Human Resources
About the Company
Skilrock Technologies is a leading organization in the gaming industry, delivering innovative
and technology-driven solutions for casino and lottery businesses globally. We are committed
to excellence, innovation, and creating a dynamic workplace environment
Position Overview
We are seeking a disciplined, enthusiastic, and career-oriented HR Intern who is eager to
gain hands-on experience in core HR functions, including Talent Acquisition, HR Operations,
and Employee Engagement.
Key Responsibilities
 Assist in end-to-end recruitment activities (sourcing, screening, interview
coordination)
 Support onboarding and employee documentation processes
 Maintain and update HR records
 Work on data management and reporting using MS Excel
 Assist in organizing employee engagement initiatives
 Provide support in day-to-day HR operations
Required Skills & Competencies
 Good knowledge of MS Excel (Advanced Excel will be an added advantage)
 Strong verbal and written communication skills
 Good organizational and coordination abilities
 Disciplined, detail-oriented, and proactive approach
 Ability to maintain confidentiality and professionalism
Qualification
 MBA (HR) – Pursuing or Completed
What You Will Gain
 Practical exposure to core HR functions
 Hands-on experience in recruitment and HR operations
 Opportunity to work in a professional and growth-oriented environment
"""

resume_text="""
Master of Business Administration (Human Resource Development)
Mayank Raj
Department of Commerce
mayank.r26@mhrod,in Delhi School of Economics
+91 9523682089 University of Delhi
ACADEMIC QUALIFICATIONS
Degree Stream Institute Year (%/CGPA)
PG MBA (HRD) Delhi School of Economics, University of Delhi 2024-2026 Pursuing
UG BSc. Statistics Hons. Banaras Hindu University 2020-2023 8.19/10
12th Science DAV Public School Hazaribagh 2019 94.80 %
10th --- DAV Public School Hazaribagh 2017 10 CGPA
INTERNSHIPS
• Worked for ISO 21001 Certification for CareerTrek
• Proposed 7 executive courses for Times Group to enhance capabilities of employees
Jun’2025
MT HR Intern, • Assisted in designing the LMS, contributing to its structure, flow, and user experience
-
CareerTrek • Onboarded domain experts for Masterstack Product Management sessions
Aug’2025
• Designed 20 modules (75 hrs) and 5 toolkits on Product Management & Finance
• Recommended 4 global courses for Bennett University by conducting market research
• Managed applicant tracking system (ATS) records for 500+ candidates
• Supported end-to-end candidate onboarding process Nov’2024
HR Intern,
• Assisted in vendor empanelment for ~30 clients with Karyarth -
Karyarth Consulting
• Screened, sourced, and shortlisted candidates from 100+ resumes Feb’2025
• Tracked and managed employee performance records on a daily, weekly, and monthly basis
POSITION OF RESPONSIBILITY
• Organized Erudition, TEDx, and Valedictory Ceremony
2024
Co-Convenor, Team • Led ERUDITION, an annual business convention with 300+ participants
-
Convention • Managed end-to-end TEDx organization and speaker curation
Present
• Engaged 50+ business leaders and HR professionals for the HR Conference
• Led initiatives to build social awareness and soft skills among students
Senior member, 2024
• Organized a blood donation camp with 40+ participants
Team Sankalp -
• Organized Sharebox drive with 100+ donations for the needy
Present
• Mediated CSR collaboration between Spyne and an NGO during Diwali
2017
Academic Captain • Organized 5 + guest lectures for students in different subjects -
• Organized special classes for low scorers after every exam 2019
CERTIFICATIONS/ACHIEVEMENTS
• Completed a certification in Learning and Development by IIT Kharagpur 2025
Certifications • Completed a certification in Strategic Performance Management by IIT Kharagpur 2025
• Completed a certification in AI in HR by IIT Guwahati 2025
Academic • Researching the impact of menstruation on young women's mental health
2024
Achievement
• Secured 2nd runner-up position at IIT Kanpur’s national-level case competition Prabandhan 2025
• Won KASHIYATRA 2022 IIT BHU national-level debate 2022
Extra-curricular • Got 2nd best speaker position in Confab 21 national debate by SGTBK college, DU 2021
• Got 3rd position in MERAKI national level open mic organized by DTU 2021 2021
• Won the 2021 national-level open mic of ARSD College, DU 2021
OTHER INFORMATION
Skills Team management | MS Excel | Communication skill
Interests Public speaking | PowerBI | Theatre
Languages English | Hindi
Department of Commerce, Delhi School of Economics | corporate.relations@mhrod.in
"""


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    args = build_parser().parse_args()
    config = {"configurable": {"thread_id": args.session_id}}

    print(f"Session: {args.session_id}")
    print("Type 'exit' or 'quit' to stop.\n")

    while True:
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nExiting.")
            break

        if not user_input:
            continue
        if user_input.lower() in {"exit", "quit"}:
            print("Exiting.")
            break

        try:
            _log_agent_state(config, "Before invoke")
            result = agent.invoke(
                {
                    "user_input": user_input,
                    "system_message": SYSTEM_MESSAGE,
                    "jd_text":jd_text,
                    "resume_text":resume_text
                },
                config=config,
            )
            _log_agent_state(config, "After invoke")
        except Exception as exc:
            print(f"Error: {exc}")
            continue

        response_text = result.get("output", "I'm sorry, I couldn't process that.")
        print(f"AI: {response_text}\n")

        if result.get("interview_complete"):
            report_download_url = result.get("report_download_url")
            if report_download_url:
                print(f"Report: {report_download_url}")
            break


if __name__ == "__main__":
    main()
