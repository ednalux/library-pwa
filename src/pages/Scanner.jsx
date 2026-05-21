import React, { useState } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { db } from '../firebase'; 
import { collection, query, where, getDocs, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore'; 

const ScannerPage = ({ setViewMode }) => {
  const [scanData, setScanData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleScan = async (result) => {
    if (isLoading || !result || result.length === 0) return;

    // 1️⃣ QR 원본 데이터 (예: "2212024_1774785200133")
    const rawScannedText = result[0].rawValue.trim(); 
    setScanData(rawScannedText);
    setIsLoading(true); 
    
    try {
      // 2️⃣ 꼬리표 떼고 순수 학번만 추출! (예: "2212024")
      const actualStudentId = rawScannedText.split('_')[0];

      // 🚨 3️⃣ 핵심 수정: 'seats'가 아니라 'Seat' 컬렉션에서 찾기!!!
      const seatsRef = collection(db, "Seat");
      const q = query(seatsRef, where("status", "==", "RESERVED"));
      const snapshot = await getDocs(q);

      console.log("현재 Seat 폴더에 예약된 좌석들:", snapshot.docs.map(d => ({ id: d.id, ...d.data() })));

      // 4️⃣ 추출된 학번이 포함된 예약 좌석 찾기
      const seatDoc = snapshot.docs.find(doc => {
        const dbUserId = doc.data().userId || "";
        return dbUserId.includes(actualStudentId); 
      });

      if (!seatDoc) {
        throw new Error(`예약된 좌석이 없습니다. (추출된 학번: ${actualStudentId})`);
      }

      // 🚨 5️⃣ 업데이트할 때도 'Seat' 컬렉션 명시!!!
      const seatRef = doc(db, "Seat", seatDoc.id);
      const seatLabel = seatDoc.data().label || seatDoc.id;

      // 6️⃣ 좌석 상태 '사용 중(OCCUPIED)'으로 변경
      await updateDoc(seatRef, {
        status: "OCCUPIED",
        startedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // 7️⃣ 로그 기록 남기기
      await addDoc(collection(db, "Log"), {
        action: "QR_AUTH_SUCCESS",
        studentNo: actualStudentId,
        seatId: seatDoc.id,
        message: `${seatLabel} 좌석 키오스크 입실 완료`, 
        createdAt: serverTimestamp()     
      });

      // 8️⃣ 성공 팝업 띄우고 화면 새로고침! (노란색 ➔ 초록색)
      alert(`✅ 인증 성공!\n${seatLabel} 좌석 이용을 시작합니다.`);
      setViewMode('MAP');

    } catch (error) {
      console.error("인증 에러:", error);
      alert(`❌ 인증 실패: ${error.message || error}`);
      setScanData(null); 
    } finally {
      setTimeout(() => setIsLoading(false), 2000); 
    }
  };

  const handleError = (error) => {
    console.error(error);
    alert(`📸 카메라 에러: ${error?.message || "알 수 없는 에러"}`);
  };

  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h2 style={{ color: '#0f172a', fontWeight: '900', marginBottom: '20px' }}>
        📸 입구 스캐너 (QR 체크인)
      </h2>

      <div style={{ maxWidth: '400px', margin: '0 auto', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', position: 'relative' }}>
        
        {isLoading && (
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(255,255,255,0.8)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '1.2rem', color: '#2563eb' }}>
            ⏳ 인증 처리 중...
          </div>
        )}

        <Scanner 
          onScan={handleScan}
          onError={handleError}
          components={{ audio: false, finder: false }}
          constraints={{ facingMode: 'user' }} 
        />
      </div>

      {scanData && !isLoading && (
        <div style={{ marginTop: '20px', padding: '15px', background: '#bbf7d0', borderRadius: '15px', color: '#14532d', fontWeight: '900' }}>
          마지막 인식 기록: {scanData}
        </div>
      )}
    </div>
  );
};

export default ScannerPage;