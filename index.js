/*
CORS Anywhere as a Cloudflare Worker!
(c) 2019 by Zibri (www.zibri.org)
email: zibri AT zibri DOT org
https://github.com/Zibri/cloudflare-cors-anywhere
*/

const blacklist = [ ];      // regexp for blacklisted urls
const whitelist = [ ".*" ]; // regexp for whitelisted origins

const url_regex = /^\/(http[s]?):\/(\/)?(.*)/

export default {
    async fetch(request, env, ctx) {
            
        function isListed(uri,listing) {
            let ret = false;
            if (typeof uri == "string") {
                listing.forEach((m) => {
	            if (uri.match(m) != null) ret = true;
                });
            } else {           // decide what to do when Origin is null
    	        ret = true;    // true accepts null origins false rejects them.
            }
            return ret;
        }

        const isOPTIONS = (request.method == "OPTIONS");
        const origin_url = new URL(request.url);

        function fix(myHeaders) {

            // myHeaders.set("Access-Control-Allow-Origin", "*");
            myHeaders.set("Access-Control-Allow-Origin", request.headers.get("Origin"));

            if (isOPTIONS) {
                myHeaders.set("Access-Control-Allow-Methods", request.headers.get("access-control-request-method"));
                //myHeaders.set("Access-Control-Allow-Credentials", "true");

                const acrh = event.request.headers.get("access-control-request-headers");
                if (acrh) {
                    myHeaders.set("Access-Control-Allow-Headers", acrh);
                }

                myHeaders.delete("X-Content-Type-Options");
            }

            return myHeaders;
        }
        
        let fetch_url = decodeURIComponent(origin_url.pathname);
        console.log("fetch_url = ", fetch_url);

        const m = url_regex.exec(fetch_url);
        if (m === null) {
            console.log("Reply 404: ", m)
            return new Response(
                "Missing URL",
                {
                    status: 404,
                    statusText: 'Missing URL',
                    headers: {
                        "Content-Type": "text/html"
                    }
                }
            );
        }
        fetch_url = m[1] + "://" + m[3];
        console.log("fetch_url = ", fetch_url);

        const orig = request.headers.get("Origin");
        const remIp = request.headers.get("CF-Connecting-IP");

        if ((!isListed(fetch_url, blacklist)) && (isListed(orig, whitelist))) {

            let xheaders = request.headers.get("x-cors-headers");
            if (xheaders != null) {
                try {
                    xheaders = JSON.parse(xheaders);
                } catch (e) {}
            }

            const recv_headers = {};
            for (var pair of request.headers.entries()) {
                if ((pair[0].match("^origin") == null) && 
		    (pair[0].match("eferer") == null) && 
		    (pair[0].match("^cf-") == null) && 
		    (pair[0].match("^x-forw") == null) && 
		    (pair[0].match("^x-cors-headers") == null)
		   ) recv_headers[pair[0]] = pair[1];
            }
		    
            if (xheaders != null) {
                Object.entries(xheaders).forEach((c)=>recv_headers[c[0]] = c[1]);
            }

            const newreq = new Request(request,{
                "redirect": "follow",
                "headers": recv_headers
            });

            const response = await fetch(fetch_url,newreq);
            let myHeaders = new Headers(response.headers);

            const cors_headers = [];
            const allh = {};

            for (var pair of response.headers.entries()) {
                cors_headers.push(pair[0]);
                allh[pair[0]] = pair[1];
            }
            cors_headers.push("cors-received-headers");
            myHeaders = fix(myHeaders);
            
            myHeaders.set("Access-Control-Expose-Headers", cors_headers.join(","));
            myHeaders.set("cors-received-headers", JSON.stringify(allh));

            let body = null;
            if (!isOPTIONS) {
                body = await response.arrayBuffer();
            }

            const init = {
                headers: myHeaders,
                status: (isOPTIONS ? 200 : response.status),
                statusText: (isOPTIONS ? "OK" : response.statusText)
            };

            return new Response(body,init);
            
        } else {

            return new Response(
                {
                    status: 403,
                    statusText: 'Forbidden',
                    headers: {
                        "Content-Type": "text/html"
                    }
                });
        }
    },
};
