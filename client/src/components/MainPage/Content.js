/* eslint-disable import/no-webpack-loader-syntax */
// Please note that the above comment is required to raw-load markdown 

import React, { useState } from 'react';
import Markdown from 'markdown-to-jsx'

import generalInformation from '!!raw-loader!../../markdown/pages/generalInstructions.md'
import oBuyerPrivateInformation1 from '!!raw-loader!../../markdown/private/Buyer1.md'
import oBuyerPrivateInformation2 from '!!raw-loader!../../markdown/private/oBuyer2.md'
import oSellerPrivateInformation1 from '!!raw-loader!../../markdown/private/Seller1.md'
import oSellerPrivateInformation2 from '!!raw-loader!../../markdown/private/oSeller2.md'
import pBuyerPrivateInformation1 from '!!raw-loader!../../markdown/private/Buyer1.md'
import pBuyerPrivateInformation2 from '!!raw-loader!../../markdown/private/pBuyer2.md'
import pSellerPrivateInformation1 from '!!raw-loader!../../markdown/private/Seller1.md'
import pSellerPrivateInformation2 from '!!raw-loader!../../markdown/private/pSeller2.md'

function Content({ appData }) {
  const { role }  = appData || {};
  let backgroundColor = "white"
  let textAlign = 'left'
  let documents = { 
    "document0": {
      title: 'General Information',
      markdown1: generalInformation,
      markdown2: ' ',
      display: true,
    },
  }
  
  // Determine documents by role - handle null/undefined role
  if(role && role.includes("optimisticBuyer")){
    documents["document1"] = {
      title: 'Role-Specific Information', 
      markdown1: oBuyerPrivateInformation1,
      markdown2: oBuyerPrivateInformation2,
      display: true, 
    }
  } else if(role && role.includes("optimisticSeller")){
    documents["document1"] = {
      title: 'Role-Specific Information', 
      markdown1: oSellerPrivateInformation1,
      markdown2: oSellerPrivateInformation2,
      display: true, 
    }
  } else if(role && role.includes("pessimisticBuyer")){
    documents["document1"] = {
      title: 'Role-Specific Information', 
      markdown1: pBuyerPrivateInformation1,
      markdown2: pBuyerPrivateInformation2,
      display: true, 
    }
  } else if(role && role.includes("pessimisticSeller")){
    documents["document1"] = {
      title: 'Role-Specific Information', 
      markdown1: pSellerPrivateInformation1,
      markdown2: pSellerPrivateInformation2,
      display: true, 
    }
  } else if (!role) {
    // Role not yet assigned - show loading message in document1
    documents["document1"] = {
      title: 'Role-Specific Information', 
      markdown1: 'Loading your role-specific information...',
      markdown2: ' ',
      display: true, 
    }
  }
  
  // Default to Role-specific information if available, otherwise General
  const defaultDocument = documents["document1"] ? "document1" : "document0";
  const [selectedDocument, setSelectedDocument] = useState(defaultDocument);
  
  // Get the content of the selected document
  const currentDocument = documents[selectedDocument];
  
  return (
    <div className="content-panel"  style={{ backgroundColor, textAlign}}>
      <div className="document-buttons">
        <div className="flex-container">

          <div className="flex-column">
            <div>
              {Object.keys(documents).map((docKey) => (
                <button
                  key={docKey}
                  type="button"
                  className={`btn ${selectedDocument === docKey ? 'active' : ''}`}
                  onClick={() => setSelectedDocument(docKey)}
                >
                  {documents[docKey].title}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      {currentDocument.display && (
        <div>
          <Markdown>
            {currentDocument.markdown1}
          </Markdown>
          <Markdown>
            {currentDocument.markdown2}
          </Markdown>
        </div>
      )}
    </div>
  );
}

export default Content;