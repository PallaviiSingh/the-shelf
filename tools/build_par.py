# -*- coding: utf-8 -*-
import json, os, re, ssl, time, urllib.request, urllib.parse, io, hashlib, random
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image, ImageDraw, ImageFont, ImageStat
ROOT="/Users/pallavisingh/Downloads/Bookshelf Website"
ctx=ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
UA={"User-Agent":"PallaviBookshelf/1.0 (personal; enriquecool8@gmail.com)"}
COV=ROOT+"/assets/covers"; AUT=ROOT+"/assets/authors"; BKS=ROOT+"/data/books"; AUS=ROOT+"/data/authors"
for d in (COV,AUT,BKS,AUS): os.makedirs(d,exist_ok=True)
def jget(u,tries=2):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=20,context=ctx) as r: return json.loads(r.read())
        except Exception:
            if i==tries-1: return None
            time.sleep(0.5+random.random())
def dl(u,tries=2):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=30,context=ctx) as r: return r.read()
        except Exception:
            if i==tries-1: return None
            time.sleep(0.5+random.random())

raw=json.load(open(ROOT+"/data/_raw/all_books.json"))
def slugify(s):
    s=re.sub(r"[’'`]","",s); s=re.sub(r"&"," and ",s)
    s=re.sub(r"[^a-zA-Z0-9]+","-",s).strip("-").lower(); return re.sub(r"-+","-",s)[:70] or "book"
def clean_author(a):
    a=re.sub(r"\((Ed\.?|Editor|Author|Illustrator|trans\.?|Translator)[^)]*\)","",a,flags=re.I)
    return re.sub(r"\s+"," ",a).strip(" -,")
def guess(book):
    lbl=(book.get("shelfLabel") or "").lower(); t=book["title"].lower(); pub=(book.get("publisher") or "").lower()
    region="World"
    if "indian liter" in lbl or "indian literary" in lbl or any(k in pub for k in["rajkamal","hind yugm","nayee","vagdevi","anamika","radhakrishan","worldview","motilal","swaraj","harper hindi"]): region="India"
    genre="Fiction"; subs=[]
    if "drama and poetry" in lbl:
        genre="Poetry" if any(k in t for k in["poem","poetry","sonnet","paradise lost","rime","lyrical","leaves of grass","goblin","wessex","ode","milton","dylan thomas"]) else "Drama"
    elif any(k in lbl for k in["literary history","oxford history","critical","theory","for beginners","beginning ","introduction","pelican guide","norton anthology","glossary","dictionary of","cultural studies","postcolonial","posthuman"]):
        genre="Non-fiction"; subs=["Philosophy & Theory"]
    elif any(k in lbl for k in["clothbound","english library","classics"]): genre="Fiction"; subs=["Classic"]
    if any(k in t for k in["for beginners","beginning ","introduction to","a very short","anthology","glossary","dictionary","history of english"]): genre="Non-fiction"
    return genre, subs, region

seen={}; order=[]
for b in raw:
    b["authors"]=[clean_author(a) for a in b["authors"] if clean_author(a)]
    slug=slugify(b["title"])
    if slug in seen: continue
    seen[slug]=b; b["slug"]=slug; order.append(b)
authors={}
for b in order:
    aslugs=[]
    for a in b["authors"]:
        asl=slugify(a); authors.setdefault(asl,{"slug":asl,"name":a,"books":[]})
        authors[asl]["books"].append(b["slug"]); aslugs.append(asl)
    b["authorSlugs"]=aslugs

PALETTE=[(60,42,28),(46,58,52),(38,52,77),(90,40,40),(58,50,72),(74,64,44),(40,60,64),(88,60,40)]
def gen_cover(slug,title,author,path):
    col=PALETTE[int(hashlib.md5(slug.encode()).hexdigest(),16)%len(PALETTE)]
    im=Image.new("RGB",(400,600),col); d=ImageDraw.Draw(im)
    try:
        f=ImageFont.truetype("/System/Library/Fonts/Supplemental/Georgia.ttf",34); fa=ImageFont.truetype("/System/Library/Fonts/Supplemental/Georgia.ttf",20)
    except: f=ImageFont.load_default(); fa=f
    d.rectangle([18,18,382,582],outline=(255,255,255),width=2)
    words=title.split(); line=""; y=150; lines=[]
    for w in words:
        tt=(line+" "+w).strip()
        if d.textlength(tt,font=f)>318 and line: lines.append(line); line=w
        else: line=tt
    lines.append(line)
    for ln in lines[:7]: d.text((200,y),ln,font=f,fill=(245,238,225),anchor="ma"); y+=42
    if author: d.text((200,560),author[:40],font=fa,fill=(230,220,205),anchor="ma")
    im.save(path,quality=86); return "#%02x%02x%02x"%col
def dominant(path):
    try:
        im=Image.open(path).convert("RGB").resize((50,50)); px=list(im.getdata())
        keep=[q for q in px if not (sum(q)>720 or sum(q)<45)] or px
        r=sum(q[0] for q in keep)//len(keep);g=sum(q[1] for q in keep)//len(keep);bl=sum(q[2] for q in keep)//len(keep)
        return "#%02x%02x%02x"%(r,g,bl)
    except: return "#6b5b4b"
def looks_real(data):
    try:
        im=Image.open(io.BytesIO(data)).convert("RGB");w,h=im.size
        return len(data)>3000 and w>=180 and 0.5<w/h<0.82 and sum(ImageStat.Stat(im.resize((40,60))).stddev)>26
    except: return False

def do_book(b):
    jf=BKS+"/"+b["slug"]+".json"
    if os.path.exists(jf): return "skip"
    author0=b["authors"][0] if b["authors"] else ""
    path=COV+"/"+b["slug"]+".jpg"; src="generated"; match="generated"
    # search once for cover_i + meta
    sr=None
    try:
        q=urllib.parse.quote(f"{b['title']} {author0}".strip())
        sr=jget(f"https://openlibrary.org/search.json?q={q}&fields=cover_i,first_publish_year,number_of_pages_median&limit=1")
    except: sr=None
    got=False
    if b.get("isbn"):
        iz=re.sub(r"[^0-9Xx]","",b["isbn"])
        data=dl(f"https://covers.openlibrary.org/b/isbn/{iz}-L.jpg?default=false")
        if data and looks_real(data): open(path,"wb").write(data); src,match="openlibrary","isbn"; got=True
    if not got and sr and sr.get("docs") and sr["docs"][0].get("cover_i"):
        data=dl(f"https://covers.openlibrary.org/b/id/{sr['docs'][0]['cover_i']}-L.jpg")
        if data and looks_real(data): open(path,"wb").write(data); src,match="openlibrary","title-search"; got=True
    if not got: gen_cover(b["slug"],b["title"],author0,path)
    dom=dominant(path)
    year=None; pages=None
    if sr and sr.get("docs"):
        year=sr["docs"][0].get("first_publish_year"); pages=sr["docs"][0].get("number_of_pages_median")
    genre,subs,region=guess(b)
    rec={"slug":b["slug"],"title":b["title"],"subtitle":None,"authors":b["authorSlugs"],"translator":None,
      "originalLanguage":"English","translated":False,"originalPublicationYear":year,
      "edition":{"publisher":b.get("publisher"),"series":None,"isbn":b.get("isbn"),"pageCount":pages},
      "cover":{"file":f"assets/covers/{b['slug']}.jpg","source":src,"match":match,"sourceUrl":None,"dominantColor":dom},
      "genre":genre,"subgenres":subs,"region":region,"tags":[],"moods":[],"difficulty":"moderate","pace":"steady",
      "vibeProfile":{"occasions":[],"sensory":[],"oneLine":""},"summary":"","summarySource":"pending",
      "whyReadIt":"","awards":[],"funFacts":[],"physicalShelf":b.get("shelf"),"enriched":False}
    json.dump(rec,open(jf,"w"),indent=2,ensure_ascii=False)
    return src

def do_author(info):
    asl=info["slug"]; jf=AUS+"/"+asl+".json"
    if os.path.exists(jf): return "skip"
    name=info["name"]; bio=""; photo=None; url=None
    s=jget("https://en.wikipedia.org/api/rest_v1/page/summary/"+urllib.parse.quote(name))
    if s and s.get("type")!="disambiguation":
        bio=" ".join((s.get("extract") or "").split()[:55])
        url=s.get("content_urls",{}).get("desktop",{}).get("page")
        oi=s.get("originalimage",{}).get("source") or s.get("thumbnail",{}).get("source")
        if oi:
            data=dl(oi)
            if data and len(data)>2500:
                try:
                    im=Image.open(io.BytesIO(data)).convert("RGB")
                    if im.width>640: im=im.resize((640,int(im.height*640/im.width)),Image.LANCZOS)
                    im.save(AUT+"/"+asl+".jpg",quality=84); photo={"file":f"assets/authors/{asl}.jpg","source":"wikimedia","sourceUrl":url}
                except: pass
    rec={"slug":asl,"name":name,"birthYear":None,"deathYear":None,"nationality":"","bio":bio,"photo":photo,
         "books":sorted(set(info["books"])),"enriched":False}
    json.dump(rec,open(jf,"w"),indent=2,ensure_ascii=False); return "ok"

todo_b=[b for b in order if not os.path.exists(BKS+"/"+b["slug"]+".json")]
todo_a=[a for a in authors.values() if not os.path.exists(AUS+"/"+a["slug"]+".json")]
print(f"books to do: {len(todo_b)} / {len(order)}; authors to do: {len(todo_a)} / {len(authors)}",flush=True)
cnt={}; done=0
with ThreadPoolExecutor(max_workers=8) as ex:
    futs={ex.submit(do_book,b):b for b in todo_b}
    for f in as_completed(futs):
        r=f.result(); cnt[r]=cnt.get(r,0)+1; done+=1
        if done%40==0: print(f"  books {done}/{len(todo_b)}  {cnt}",flush=True)
print(f"BOOKS DONE {cnt}",flush=True)
done=0
with ThreadPoolExecutor(max_workers=8) as ex:
    futs={ex.submit(do_author,a):a for a in todo_a}
    for f in as_completed(futs):
        f.result(); done+=1
        if done%50==0: print(f"  authors {done}/{len(todo_a)}",flush=True)
print("AUTHORS DONE",flush=True)
print("BUILD COMPLETE",flush=True)
