# -*- coding: utf-8 -*-
# Extract a small, vivid palette from each cover (most prominent non-white/black colours)
# and store it as cover.palette (list of hex, most prominent first) for the detail-page header.
import os, glob, json, colorsys
from PIL import Image
ROOT="/Users/pallavisingh/Downloads/Bookshelf Website"
BKS=os.path.join(ROOT,"data/books")

def sat(r,g,b):
    h,l,s=colorsys.rgb_to_hls(r/255,g/255,b/255); return s,l

def palette(path,k=3):
    im=Image.open(path).convert("RGBA")
    im.thumbnail((110,110))
    px=list(im.getdata())
    buckets={}   # coarse bucket -> [count, sumR, sumG, sumB]
    for r,g,b,a in px:
        if a<128: continue
        s=r+g+b
        if s>715 or s<45: continue          # skip near-white / near-black
        key=(r//24,g//24,b//24)
        d=buckets.setdefault(key,[0,0,0,0])
        d[0]+=1; d[1]+=r; d[2]+=g; d[3]+=b
    if not buckets: return []
    items=[]
    for (cnt,sr,sg,sb) in buckets.values():
        r,g,b=sr//cnt,sg//cnt,sb//cnt
        s,l=sat(r,g,b)
        # prefer prominent AND saturated, but don't fully exclude rich muted tones
        score=cnt*(0.35+0.65*s)
        items.append((score,cnt,s,l,(r,g,b)))
    items.sort(reverse=True)
    chosen=[]
    for score,cnt,s,l,(r,g,b) in items:
        # skip washed-out greys unless we have nothing yet
        if s<0.14 and chosen: continue
        if any((abs(r-cr)+abs(g-cg)+abs(b-cb))<70 for (cr,cg,cb) in chosen): continue  # dedupe similar
        chosen.append((r,g,b))
        if len(chosen)>=k: break
    if not chosen:  # fallback: most frequent bucket
        r,g,b=items[0][4]; chosen=[(r,g,b)]
    return ["#%02x%02x%02x"%c for c in chosen]

n=0
for f in sorted(glob.glob(BKS+"/*.json")):
    d=json.load(open(f)); cov=d.get("cover") or {}
    rel=cov.get("file")
    if not rel: continue
    p=os.path.join(ROOT,rel)
    if not os.path.exists(p): continue
    try:
        pal=palette(p)
        if pal:
            cov["palette"]=pal; d["cover"]=cov
            json.dump(d,open(f,"w"),indent=2,ensure_ascii=False); n+=1
    except Exception as e:
        print("ERR",os.path.basename(f),e)
print("palettes written:",n)
