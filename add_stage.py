import os, sys, re, json, time, requests, trafilatura
from urllib.parse import urlparse
from bs4 import BeautifulSoup

KEY = os.environ["TRELLO_KEY"]
TOKEN = os.environ["TRELLO_TOKEN"]
GROQ_KEY = os.environ.get("GROQ_API_KEY")
MODELS = [m.strip() for m in os.environ.get(
    "GROQ_MODELS", "openai/gpt-oss-120b,llama-3.3-70b-versatile"
).split(",") if m.strip()]
BOARD_ID = os.environ.get("TRELLO_BOARD", "")
LIST_NAME = os.environ.get("TRELLO_LIST", "Stages")

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
MAX_PROMPT_CHARS = 10000   # reste sous la limite de tokens par minute de l'offre gratuite

AUTH = {"key": KEY, "token": TOKEN}
API = "https://api.trello.com/1"
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

# Mots-clés du mode de secours (sans IA) : adapte les noms à tes étiquettes Trello
KEYWORDS = {
    "DevSecOps": r"devsecops|sast|dast|sécurité.{0,20}(ci/cd|pipeline)",
    "DevOps": r"devops|ci/cd|jenkins|gitlab|docker|kubernetes|terraform|ansible|helm",
    "Cloud": r"\baws\b|azure|gcp|google cloud|cloud",
    "Cybersécurité": r"cyber|sécurité|pentest|\bsoc\b|siem|owasp|\bgrc\b|iso 27001",
    "Réseaux": r"réseau|cisco|routage|vlan|firewall|\bwan\b|\blan\b",
    "AI": r"\bia\b|\bai\b|machine learning|llm|deep learning|intelligence artificielle",
    "Système et Infra": r"linux|windows server|virtualisation|vmware|proxmox|active directory|infrastructure|sysadmin",
    "Développement logiciel": r"développeur|développement|python|java\b|react|angular|node|backend|frontend|full.?stack",
    "Testeur": r"testeur|\bqa\b|recette|test logiciel|selenium|cypress|qualité logicielle",
    "Support IT": r"support|helpdesk|help desk|assistance utilisateur|technicien|\bitsm\b|glpi",
    "PowerPlaterforme dev": r"power apps|power automate|power platform|power bi",
}


# ---------- Récupération de la page ----------
def fetch(url, render=False):
    if render:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(user_agent=UA)
            page.goto(url, wait_until="networkidle", timeout=45000)
            html, final = page.content(), page.url
            browser.close()
        return html, final
    r = requests.get(url, headers={"User-Agent": UA}, timeout=20)
    return r.text, r.url


def page_text(html):
    try:
        t = trafilatura.extract(html, include_links=True, include_formatting=True,
                                output_format="markdown", favor_recall=True)
    except Exception:
        t = None
    return t or trafilatura.extract(html, favor_recall=True) or ""


def page_meta(html):
    soup = BeautifulSoup(html, "html.parser")

    def og(name):
        tag = soup.find("meta", property=name)
        return tag["content"].strip() if tag and tag.get("content") else ""

    title = soup.title.string.strip() if soup.title and soup.title.string else ""
    return {"title": og("og:title") or title, "site": og("og:site_name")}


def jobposting(html):
    """Données structurées JobPosting (JSON-LD) publiées par de nombreux sites d'offres."""
    soup = BeautifulSoup(html, "html.parser")
    for s in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(s.string or "")
        except Exception:
            continue
        if isinstance(data, dict):
            items = data.get("@graph", [data])
        elif isinstance(data, list):
            items = data
        else:
            continue
        for it in items:
            if not isinstance(it, dict):
                continue
            t = it.get("@type")
            if t == "JobPosting" or (isinstance(t, list) and "JobPosting" in t):
                org = it.get("hiringOrganization") or {}
                company = org.get("name", "") if isinstance(org, dict) else str(org)
                desc = BeautifulSoup(it.get("description", ""), "html.parser").get_text("\n")
                return {"company": company.strip(), "title": (it.get("title") or "").strip(),
                        "desc": desc.strip()}
    return None


# ---------- Extraction par Groq ----------
def call_groq(prompt):
    """Essaie chaque modèle tour à tour sans attendre, puis refait jusqu'à 3 tours."""
    last_error, wait = None, 5
    for _ in range(3):
        for model in MODELS:
            body = {"model": model, "temperature": 0, "max_tokens": 600,
                    "messages": [{"role": "user", "content": prompt}]}
            if "gpt-oss" in model:
                body["reasoning_effort"] = "low"   # moins de "réflexion" = plus rapide
            try:
                r = requests.post(
                    GROQ_URL,
                    headers={"Authorization": f"Bearer {GROQ_KEY}",
                             "Content-Type": "application/json",
                             "User-Agent": "stage-trello/1.0"},
                    json=body, timeout=60,
                )
            except requests.RequestException as e:
                last_error = str(e)
                continue
            if r.status_code in (429, 500, 502, 503, 504):
                last_error = r.text
                try:
                    wait = max(wait, min(float(r.headers.get("retry-after", 5)), 30))
                except ValueError:
                    pass
                print(f"{model} indisponible ({r.status_code}), modèle suivant...")
                continue
            try:
                out = r.json()["choices"][0]["message"]["content"] or ""
            except (KeyError, IndexError, ValueError):
                last_error = r.text
                print(f"{model} : réponse inutilisable ({r.status_code}), modèle suivant...")
                continue
            out = re.sub(r"<think>.*?</think>", "", out, flags=re.S).strip()
            if out:
                return out
        time.sleep(wait)
    raise RuntimeError(f"Erreur API Groq : {last_error}")


def llm_extract(url, meta, text, label_names):
    prompt = f"""Voici le début d'une page web qui devrait être une offre de stage ou d'emploi.
URL : {url}
Titre de la page : {meta['title']}
Nom du site : {meta['site']}

CONTENU :
{text[:MAX_PROMPT_CHARS]}

Réponds EXACTEMENT avec ces 4 lignes, sans rien ajouter avant ni après :
FOUND: yes ou no  (yes seulement si le contenu est une offre précise ; no si c'est une page générique, une liste d'offres, une erreur ou un menu)
COMPANY: nom court de l'entreprise qui recrute (ex : Capgemini, Sopra Steria)
TITLE: intitulé du poste, court et propre, sans lieu ni mention "stage de fin d'études" superflue (ex : Ingénieur GRC)
LABELS: 1 à 3 étiquettes parmi : {', '.join(label_names)}"""

    out = call_groq(prompt)

    def field(name):
        m = re.search(rf"^{name}:\s*(.*)$", out, re.M | re.I)
        return m.group(1).strip() if m else ""

    labels = [l.strip() for l in field("LABELS").split(",") if l.strip() in label_names]
    return {"found": field("FOUND").lower().startswith("y"),
            "company": field("COMPANY"), "title": field("TITLE"), "labels": labels}


# ---------- Secours sans IA (moins précis) ----------
def heuristic_extract(url, meta, text, jp, label_names):
    domain = urlparse(url).netloc.replace("www.", "").split(".")[0].capitalize()
    company = (jp or {}).get("company") or meta["site"] or domain
    title = (jp or {}).get("title") or re.split(r"\s[-|–]\s", meta["title"])[0] or meta["title"]
    labels = [l for l, rx in KEYWORDS.items()
              if l in label_names and re.search(rx, title + " " + text, re.I)][:3]
    return {"found": bool(jp) or len(text) > 500,
            "company": company, "title": title, "labels": labels}


def build_info(url, meta, text, jp, label_names):
    info = None
    if GROQ_KEY:
        try:
            info = llm_extract(url, meta, text, label_names)
        except Exception as e:
            print(f"IA indisponible ({e}), mode de secours.")
    if info is None:
        info = heuristic_extract(url, meta, text, jp, label_names)
    # Complète les champs vides avec les données structurées ou les métadonnées
    domain = urlparse(url).netloc.replace("www.", "").split(".")[0].capitalize()
    info["company"] = info["company"] or (jp or {}).get("company") or meta["site"] or domain
    info["title"] = info["title"] or (jp or {}).get("title") or meta["title"] or "Offre"
    # Description : JSON-LD si disponible (propre), sinon texte extrait de la page
    info["desc"] = jp["desc"] if jp and len(jp["desc"]) > 300 else text
    return info


# ---------- Trello ----------
def board_labels(board_id):
    labels = requests.get(f"{API}/boards/{board_id}/labels", params=AUTH).json()
    by_name = {}
    for l in labels:
        if l.get("name"):
            by_name.setdefault(l["name"], l["id"])
    return by_name


def list_boards():
    """Tableaux ouverts de l'utilisateur, avec leurs listes ouvertes."""
    boards = requests.get(f"{API}/members/me/boards", params={
        **AUTH, "fields": "name", "filter": "open", "lists": "open"}).json()
    return [{"id": b["id"], "name": b["name"],
             "lists": [{"id": l["id"], "name": l["name"]} for l in b.get("lists", [])]}
            for b in boards]


def create_card(url, info, list_id, by_name):
    label_ids = [by_name[n] for n in info["labels"] if n in by_name]
    name = f"{info['company']} - {info['title']}"
    card = requests.post(f"{API}/cards", params={
        **AUTH, "idList": list_id, "name": name,
        "desc": info["desc"][:16000], "idLabels": ",".join(label_ids)}).json()
    requests.post(f"{API}/cards/{card['id']}/attachments",
                  params={**AUTH, "url": url})
    print(f"Carte créée : {card['shortUrl']}")
    print(f"  Titre      : {name}")
    print(f"  Étiquettes : {info['labels']}")
    print(f"  Description: {len(info['desc'])} caractères")
    return name, card["shortUrl"]


def main(url, page_html=None, board_id=None, list_id=None):
    board_id = board_id or BOARD_ID
    if not board_id:
        raise RuntimeError("Aucun tableau choisi : définis TRELLO_BOARD dans .env ou choisis-le dans le popup.")
    by_name = board_labels(board_id)
    label_names = list(by_name)
    if not list_id:
        lists = requests.get(f"{API}/boards/{board_id}/lists", params=AUTH).json()
        list_id = next(l["id"] for l in lists if l["name"] == LIST_NAME)

    info = None
    # Si l'extension fournit la page déjà rendue, on l'essaie en premier
    attempts = ([None] if page_html else []) + [False, True]
    for render in attempts:
        if render is None:
            html, final_url = page_html, url
        else:
            try:
                html, final_url = fetch(url, render=render)
            except ImportError:
                print("Playwright non installé : pip install playwright && playwright install chromium")
                break
            except Exception as e:
                print(f"Échec de récupération (render={render}) : {e}")
                continue
        meta, text, jp = page_meta(html), page_text(html), jobposting(html)
        info = build_info(final_url, meta, text, jp, label_names)
        if info["found"]:
            break
        if render is not True:
            print("Pas d'offre détectée, nouvel essai...")

    if not info or not info["found"]:
        raise RuntimeError("Aucune offre trouvée à cette adresse (page générique, lien expiré ou accès bloqué).")

    return create_card(url, info, list_id, by_name)


if __name__ == "__main__":
    try:
        main(sys.argv[1] if len(sys.argv) > 1 else input("Lien : ").strip())
    except RuntimeError as e:
        print(e)
        sys.exit(1)
