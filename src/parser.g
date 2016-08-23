start
  = s p:packet+ { return p }
  / null

packet
  = re s tag:tag s data:data+ { return {type: "data", id:tag, data:data, tag:tag} }
  / re s data:data+ e:end s { return {type: e.type, id:e.id, data:data, tag:tag} }
  / e:end s {return e}

re
  = "!re" { return ""}

data
  = id:identifier value:value s { return {field:id, value:value}}

identifier
  = "=" id:[\.a-z\-0-9]+ "=" {return id.join('')}

value
  = v:[^\r\n\0]+ {return v.join('')}

end
  = "!done" s tag:tag s "=ret=" ret:[a-z0-9]+ {return {type: "done_ret", id: tag, data:ret.join('')}}
  / "!done" s tag:tag                         {return {type: "done_tag", id:tag}}
  / "!done" s "=ret=" ret:[a-z0-9]+           {return {type: "done_ret", data:ret.join('')}}
  / "!done"                                   {return {type: "done" }}
  / tag:tag                                   {return {type: "tag", id:tag }}
  / t:trap                                    {return {type: "trap", trap: t}  }
  / f:fatal                                   {return {type: "fatal", data:f } }

tag 
  = ".tag=" id:[0-9]+ {return id.join('')}

trap
  = "!trap" s d:data+ { return {type:"trap", data:d} }
  / "!trap" s tag:tag s d:data+ { return {type:"trap", tag:tag, data:d}  }

fatal
  = "!fatal" s v:value {return v}

/* Tokens */

s
  = [ \t\r\n\f\0x00]* {return ""}

w
  = s?

nl
  = "\n"
  / "\r\n"
  / "\r"
  / "\f"

null
  = [\0x00]
