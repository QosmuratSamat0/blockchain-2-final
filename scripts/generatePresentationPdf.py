from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "final-presentation.pdf"
PAGE_W, PAGE_H = landscape(letter)

INK = colors.HexColor("#171717")
MUTED = colors.HexColor("#6f6f6f")
LINE = colors.HexColor("#d9d9d9")
FILL = colors.HexColor("#f7f7f7")
ACCENT = colors.HexColor("#0f766e")

TITLE = ParagraphStyle(
    "Title",
    fontName="Helvetica-Bold",
    fontSize=24,
    leading=29,
    textColor=INK,
)
SUB = ParagraphStyle(
    "Sub",
    fontName="Helvetica",
    fontSize=10,
    leading=14,
    textColor=MUTED,
)
BODY = ParagraphStyle(
    "Body",
    fontName="Helvetica",
    fontSize=11,
    leading=16,
    textColor=INK,
)
SMALL = ParagraphStyle(
    "Small",
    fontName="Helvetica",
    fontSize=9,
    leading=12,
    textColor=MUTED,
)


def p(c, text, style, x, y, w, h):
    para = Paragraph(text, style)
    para.wrapOn(c, w, h)
    para.drawOn(c, x, y + h - para.height)


def header(c, kicker, title):
    c.setFillColor(MUTED)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(0.6 * inch, PAGE_H - 0.55 * inch, kicker.upper())
    p(c, title, TITLE, 0.6 * inch, PAGE_H - 1.35 * inch, PAGE_W - 1.2 * inch, 0.6 * inch)
    c.setStrokeColor(LINE)
    c.line(0.6 * inch, PAGE_H - 1.48 * inch, PAGE_W - 0.6 * inch, PAGE_H - 1.48 * inch)


def footer(c, n):
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawString(0.6 * inch, 0.35 * inch, "DeFi SuperApp Capstone")
    c.drawRightString(PAGE_W - 0.6 * inch, 0.35 * inch, str(n))


def box(c, x, y, w, h, title, body, accent=False):
    c.setFillColor(colors.white if not accent else FILL)
    c.setStrokeColor(ACCENT if accent else LINE)
    c.roundRect(x, y, w, h, 4, stroke=1, fill=1)
    p(c, f"<b>{title}</b>", BODY, x + 0.16 * inch, y + h - 0.42 * inch, w - 0.32 * inch, 0.3 * inch)
    p(c, body, SMALL, x + 0.16 * inch, y + 0.12 * inch, w - 0.32 * inch, h - 0.55 * inch)


def bullets(c, items, x, y, w, h, style=BODY):
    text = "<br/>".join([f"&bull; {item}" for item in items])
    p(c, text, style, x, y, w, h)


slides = [
    (
        "Final Project",
        "DeFi SuperApp",
        [
            "Option A capstone: AMM + lending + ERC-4626 yield vault.",
            "Chainlink-style oracle, OpenZeppelin Governor + Timelock, The Graph subgraph.",
            "Production posture: tests, security report, CI, deploy scripts, post-deploy checks.",
            "Instructor-approved 4-person team with separate ownership tracks.",
        ],
    ),
    (
        "Team",
        "Four Clear Ownership Tracks",
        [
            "Samat: AMM, factory, CREATE/CREATE2, LP accounting, swap math, gas inputs.",
            "Dauren: lending, vault, oracle adapter, mocks, collateral and liquidation mechanics.",
            "Arthur: governance, Timelock, UUPS treasury, vulnerability case studies, tests.",
            "Ernar: frontend, subgraph, CI, deployment scripts, demo docs, slide delivery.",
        ],
    ),
    (
        "Product",
        "One Protocol, Three User Flows",
        [
            "Swap assets through a constant-product AMM with 0.3% fee and slippage checks.",
            "Deposit stable assets into an ERC-4626 vault and receive tokenized shares.",
            "Use collateralized lending with LTV, health factor, liquidation, and linear interest.",
        ],
    ),
    (
        "Architecture",
        "Contract System Map",
        [
            "GovernanceToken delegates voting power to Governor.",
            "Governor queues successful proposals into a 2-day Timelock.",
            "Timelock controls treasury, oracle parameters, lending risk, vault roles, and upgrades.",
            "Subgraph indexes protocol events for frontend activity/proposal views.",
        ],
    ),
    (
        "Solidity",
        "Mandatory Advanced Components",
        [
            "UUPS upgrade path: ProtocolTreasuryV1 -> ProtocolTreasuryV2.",
            "Factory pattern: AMMFactory deploys pairs through CREATE and CREATE2.",
            "Assembly benchmark: AssemblyMath.sumYul compared to sumSolidity.",
            "Token standards: ERC20Votes + Permit, ERC-721 positions, ERC-4626 vault.",
        ],
    ),
    (
        "Security",
        "Controls And Case Studies",
        [
            "Privileged functions use AccessControl; post-deploy check validates Timelock ownership.",
            "ReentrancyGuard and CEI are used where external calls or value transfers occur.",
            "Oracle adapter rejects stale, zero, negative, and incomplete round data.",
            "Before/after case studies cover reentrancy and missing access control.",
        ],
    ),
    (
        "Testing",
        "87 Passing Tests",
        [
            "Core suite covers unit and revert paths for AMM, vault, lending, oracle, governance, treasury.",
            "10 deterministic fuzz-style property tests.",
            "5 invariant-style tests for k, ERC-4626 supply, lending accounting, treasury conservation, roles.",
            "3 fork-style checks against mainnet USDC, Uniswap V2, and Chainlink ETH/USD.",
        ],
    ),
    (
        "Coverage",
        "94.51% Line Coverage",
        [
            "Hardhat coverage: 93.65% statements, 94.51% lines, 93.00% functions.",
            "Slither production-scope run: 0 High/Medium findings.",
            "CI compiles, tests, coverage-checks, lints, and runs Slither.",
        ],
    ),
    (
        "Frontend",
        "Minimal dApp Demo",
        [
            "MetaMask connection and chain detection.",
            "Reads balance, voting power, delegate, AMM reserves, vault shares, and loan position.",
            "Write actions: swap, deposit, vote.",
            "Human-readable errors for missing wallet, wrong network, rejected transactions, and failed calls.",
        ],
    ),
    (
        "Deployment",
        "Reproducible L2 Path",
        [
            "Deploy script supports Arbitrum Sepolia, Optimism Sepolia, and Base Sepolia.",
            "Post-deploy script checks Timelock delay, Governor settings, treasury roles, and no admin backdoor.",
            "Final live explorer verification requires funded key, RPC URL, and explorer API key.",
            "Subgraph builds locally and is ready for Graph Studio deployment after live addresses are known.",
        ],
    ),
    (
        "Demo",
        "What To Show In 15 Minutes",
        [
            "Run local Hardhat node and deploy mocks.",
            "Open the minimal frontend at http://127.0.0.1:5173/.",
            "Connect wallet, inspect account state, perform swap/deposit/vote flows.",
            "Run npm test, npm run coverage, npm run slither, and post-deploy checks.",
        ],
    ),
]


def draw_architecture(c):
    labels = [
        ("Frontend", 0.75, 3.9, "MetaMask + Ethers.js"),
        ("Subgraph", 0.75, 2.35, "Events -> indexed entities"),
        ("AMM", 3.05, 4.35, "Factory + Pair"),
        ("Lending", 3.05, 3.2, "Collateral + debt"),
        ("Vault", 3.05, 2.05, "ERC-4626 shares"),
        ("Oracle", 5.35, 3.45, "Chainlink adapter"),
        ("Governor", 7.55, 4.15, "Vote snapshots"),
        ("Timelock", 7.55, 2.75, "2-day delay"),
        ("Treasury", 7.55, 1.35, "UUPS proxy"),
    ]
    for title, x, y, body in labels:
        box(c, x * inch, y * inch, 1.65 * inch, 0.72 * inch, title, body, title in {"Timelock", "Oracle"})
    c.setStrokeColor(MUTED)
    for x1, y1, x2, y2 in [
        (2.4, 4.26, 3.05, 4.7),
        (2.4, 4.26, 3.05, 3.55),
        (2.4, 4.26, 3.05, 2.4),
        (2.4, 2.7, 3.05, 2.35),
        (4.7, 3.55, 5.35, 3.8),
        (6.95, 3.8, 7.55, 3.1),
        (8.35, 4.15, 8.35, 3.47),
        (8.35, 2.75, 8.35, 2.07),
    ]:
        c.line(x1 * inch, y1 * inch, x2 * inch, y2 * inch)


def build():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT), pagesize=landscape(letter))

    for idx, (kicker, title, items) in enumerate(slides, start=1):
        header(c, kicker, title)
        if idx == 1:
            c.setFillColor(ACCENT)
            c.rect(0.6 * inch, 1.0 * inch, 0.12 * inch, 3.7 * inch, stroke=0, fill=1)
            p(c, "Full-Stack Decentralized Protocol<br/>Blockchain Technologies 2", SUB, 0.85 * inch, 4.55 * inch, 4.6 * inch, 0.6 * inch)
            bullets(c, items, 0.85 * inch, 1.45 * inch, 5.0 * inch, 2.7 * inch)
            box(c, 6.45 * inch, 1.55 * inch, 3.7 * inch, 2.8 * inch, "Submission posture", "Hardhat implementation with documented justification. Local demo and test suite are ready; final L2 verification requires live credentials.", True)
        elif idx == 2:
            for i, item in enumerate(items):
                x = (0.75 + (i % 2) * 4.7) * inch
                y = (3.55 - (i // 2) * 1.65) * inch
                title, body = item.split(":", 1)
                box(c, x, y, 4.0 * inch, 1.1 * inch, title, body.strip(), True)
        elif idx == 4:
            draw_architecture(c)
        elif idx in {7, 8}:
            box(c, 0.75 * inch, 3.2 * inch, 2.2 * inch, 1.35 * inch, "Tests", "87 passing", True)
            box(c, 3.35 * inch, 3.2 * inch, 2.2 * inch, 1.35 * inch, "Coverage", "94.51% lines", True)
            box(c, 5.95 * inch, 3.2 * inch, 2.2 * inch, 1.35 * inch, "Slither", "0 High / Medium", True)
            bullets(c, items, 0.85 * inch, 1.1 * inch, 8.8 * inch, 1.7 * inch)
        else:
            bullets(c, items, 0.85 * inch, 1.25 * inch, 5.3 * inch, 3.8 * inch)
            box(c, 6.6 * inch, 1.45 * inch, 3.3 * inch, 3.0 * inch, "Evidence", f"See README, docs/COVERAGE.md, docs/SECURITY_AUDIT.md, docs/GAS_REPORT.md, and scripts/postDeployCheck.js for reproducible checks.", True)
        footer(c, idx)
        c.showPage()

    c.save()


if __name__ == "__main__":
    build()
    print(OUT)
