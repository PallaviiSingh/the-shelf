# -*- coding: utf-8 -*-
import os, re, glob, json, unicodedata
from PIL import Image
ROOT="/Users/pallavisingh/Downloads/Bookshelf Website"; SRC=ROOT+"/Books Images for claude"; COV=ROOT+"/assets/covers"; BKS=ROOT+"/data/books"
def deac(s): return ''.join(c for c in unicodedata.normalize('NFKD',s) if not unicodedata.combining(c))
def norm(t):
    t=deac(t).lower(); t=re.sub(r"\(.*?\)"," ",t); t=re.sub(r"\b(a|an|the)\b"," ",t); return re.sub(r"[^a-z0-9]+"," ",t).strip()
def dom(p):
    im=Image.open(p).convert("RGB").resize((50,50)); px=list(im.getdata())
    keep=[q for q in px if not (sum(q)>720 or sum(q)<45)] or px
    r=sum(q[0] for q in keep)//len(keep);g=sum(q[1] for q in keep)//len(keep);b=sum(q[2] for q in keep)//len(keep)
    return "#%02x%02x%02x"%(r,g,b)
books={}
for f in glob.glob(BKS+"/*.json"):
    d=json.load(open(f)); books[d["slug"]]=(f,d,norm(d["title"]))
def by_sub(sub):
    sub=deac(sub).lower()
    for slug,(f,d,nt) in books.items():
        if sub in deac(d["title"]).lower(): return slug
    return None
def best(name):
    nf=norm(name); best=None; bs=0
    for slug,(f,d,nt) in books.items():
        if not nt: continue
        sc=0
        if nf==nt: sc=1000+len(nt)
        elif nf.startswith(nt+" ") and len(nt)>=5: sc=len(nt)
        elif nt.startswith(nf+" ") and len(nf)>=5: sc=len(nf)
        if sc>bs: bs=sc; best=slug
    return best if bs>=5 else None
skips={"Rilke.jpg"}
specials={"The Handmaid's Tale.jpg":("sub","handmaid"),
          "A Socio-political history of Marathi Theatre Vol 1.jpg":("slug","a-socio-political-history-of-marathi-theatre-vol-1"),
          "A Socio-political history of Marathi Theatre Vol 2.jpg":("slug","a-socio-political-history-of-marathi-theatre-vol-2"),
          "A Socio-political history of Marathi Theatre Vol 3.jpg":("slug","a-socio-political-history-of-marathi-theatre-vol-3"),
          "Alexander Pushkin.jpg":("slug","the-collected-stories"),
          "Premchand Vol 1.jpg":("slug","the-complete-short-stories-premchand-vol-1"),
          "Premchand Vol 2.jpg":("slug","the-complete-short-stories-premchand-vol-2"),
          "Premchand Vol 3.jpg":("slug","the-complete-short-stories-premchand-vol-3"),
          "Premchand Vol 4.jpg":("slug","the-complete-short-stories-premchand-vol-4"),
          "Norton American Vol A.jpg":("slug","the-norton-anthology-of-american-literature-vol-a"),
          "Norton American Vol B.jpg":("slug","the-norton-anthology-of-american-literature-vol-b"),
          "Norton American Vol C.jpg":("slug","the-norton-anthology-of-american-literature-vol-c"),
          "Norton American Vol D.jpg":("slug","the-norton-anthology-of-american-literature-vol-d"),
          "Alfred Lansing.jpg":("slug","endurance"),
          "Jeff Wallace.jpg":("slug","beginning-modernism"),
          "Oxford History of English Literature The Early Seventeenth Century.png":("slug","vol-07-oxford-history-of-english-literature-the-early-seventeenth-cent"),
          "Oxford History of English Literature- Writers of the Twentieth Century Hardy to Lawrence.jpg":("slug","vol-15-oxford-history-of-english-literature-writers-of-the-twentieth-c")}
imgs=[f for f in glob.glob(SRC+"/*") if f.lower().rsplit(".",1)[-1] in ("jpg","jpeg","png","webp","avif")]
matched=0; unmatched=[]
for img in sorted(imgs):
    fn=os.path.basename(img)
    if fn in skips: continue
    slug=None
    if fn in specials:
        k,v=specials[fn]; slug=v if k=="slug" else by_sub(v)
    if not slug: slug=best(os.path.splitext(fn)[0])
    if not slug or slug not in books: unmatched.append(fn); continue
    f,d,_=books[slug]
    try:
        im=Image.open(img).convert("RGB")
        if im.width>720: im=im.resize((720,int(im.height*720/im.width)),Image.LANCZOS)
        out=COV+"/"+slug+".jpg"; im.save(out,quality=90,optimize=True)
        d["cover"].update(file=f"assets/covers/{slug}.jpg",source="owned",match="owned-edition",sourceUrl=None,dominantColor=dom(out),w=im.width,h=im.height)
        json.dump(d,open(f,"w"),indent=2,ensure_ascii=False); matched+=1
    except Exception as e: unmatched.append(f"{fn} ({e})")
print(f"images in folder: {len(imgs)}   replaced: {matched}")
if unmatched:
    print("UNMATCHED (need your call):")
    for u in unmatched: print("   -",u)
owned=sum(1 for f in glob.glob(BKS+'/*.json') if json.load(open(f))['cover']['source']=='owned')
print("total owned covers:",owned,"/ 437")
