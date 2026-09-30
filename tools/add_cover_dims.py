# -*- coding: utf-8 -*-
# Backfill each book's natural cover pixel dimensions (cover.w / cover.h) so the
# site can render every cover at its own aspect ratio instead of a forced 2:3 crop.
import os, glob, json
from PIL import Image
ROOT="/Users/pallavisingh/Downloads/Bookshelf Website"
BKS=os.path.join(ROOT,"data/books")
n=0; miss=0
for f in sorted(glob.glob(os.path.join(BKS,"*.json"))):
    d=json.load(open(f))
    cov=d.get("cover") or {}
    rel=cov.get("file")
    if not rel:
        miss+=1; continue
    p=os.path.join(ROOT,rel)
    if not os.path.exists(p):
        miss+=1; continue
    try:
        with Image.open(p) as im:
            w,h=im.size
        cov["w"]=int(w); cov["h"]=int(h)
        d["cover"]=cov
        json.dump(d,open(f,"w"),indent=2,ensure_ascii=False)
        n+=1
    except Exception as e:
        print("ERR",rel,e); miss+=1
print(f"dimensions written: {n}   missing/failed: {miss}")
