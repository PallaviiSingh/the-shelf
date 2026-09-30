# -*- coding: utf-8 -*-
# Trim near-white margins/letterbox from covers so each cover fills its frame cleanly.
# Safe: only touches near-white uniform backgrounds; leaves coloured full-bleed covers alone.
# Backs up the pre-trim file to .cover_backups/ before overwriting; updates cover w/h + dominantColor.
# Run:  python3 tools/replace_covers.py && python3 tools/trim_covers.py && python3 tools/build_site_assets.py
import os, glob, json, shutil, sys
sys.path.insert(0, os.path.dirname(__file__))
from cover_trim import white_trim_box
from PIL import Image
ROOT="/Users/pallavisingh/Downloads/Bookshelf Website"
COV=os.path.join(ROOT,"assets/covers"); BKS=os.path.join(ROOT,"data/books")
BAK=os.path.join(ROOT,".cover_backups"); os.makedirs(BAK,exist_ok=True)

def dom(p):
    im=Image.open(p).convert("RGB").resize((50,50)); px=list(im.getdata())
    keep=[q for q in px if not (sum(q)>720 or sum(q)<45)] or px
    r=sum(q[0] for q in keep)//len(keep);g=sum(q[1] for q in keep)//len(keep);b=sum(q[2] for q in keep)//len(keep)
    return "#%02x%02x%02x"%(r,g,b)

changed=0
for f in sorted(glob.glob(COV+"/*.jpg")):
    slug=os.path.basename(f)[:-4]
    try:
        im=Image.open(f).convert("RGB"); W,H=im.size
        box=white_trim_box(im)
        if not box: continue
        l,t,r,b=box
        if (r-l)*(b-t) > 0.98*W*H: continue          # <2% change → skip
        if not os.path.exists(os.path.join(BAK,os.path.basename(f))):
            shutil.copy2(f,os.path.join(BAK,os.path.basename(f)))
        cr=im.crop(box)
        if cr.width>720: cr=cr.resize((720,int(cr.height*720/cr.width)),Image.LANCZOS)
        cr.save(f,quality=90,optimize=True)
        jf=os.path.join(BKS,slug+".json")
        if os.path.exists(jf):
            d=json.load(open(jf)); d.setdefault("cover",{})
            d["cover"]["w"]=cr.width; d["cover"]["h"]=cr.height
            d["cover"]["dominantColor"]=dom(f); d["cover"]["trimmed"]=True
            json.dump(d,open(jf,"w"),indent=2,ensure_ascii=False)
        changed+=1
        print(f"  trimmed {slug[:48]:48} {(W,H)} -> {cr.size}")
    except Exception as e:
        print("ERR",slug,e)
print(f"\ntrimmed {changed} covers. Pre-trim originals in {BAK} (restore with: cp .cover_backups/*.jpg assets/covers/)")
