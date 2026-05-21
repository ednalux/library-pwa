// 🚨 파이어베이스 도구 모음에 addDoc을 꼭 추가해야 합니다!
import { collection, onSnapshot, doc, updateDoc, getDoc, serverTimestamp, addDoc } from "firebase/firestore";
import { db } from "../firebase";

// 1. 실시간 조회 (상열이용)
export const subscribeToSeats = (setSeats) => {
  const seatCollection = collection(db, "Seat");
  const unsubscribe = onSnapshot(seatCollection, (snapshot) => {
    const seatList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setSeats(seatList);
  });
  return unsubscribe;
};

// 2. 좌석 상태 업데이트 및 🧾 영수증(Log) 자동 발행기
export const updateSeatStatus = async (seatId, newStatus, userId = null, hours = 0, userName = "", reminderMinutes = 20, studentNo = "") => {
  try {
    const seatRef = doc(db, "Seat", seatId);
    const seatSnap = await getDoc(seatRef);
    const seatData = seatSnap.exists() ? seatSnap.data() : null;

    // 🚨 1. 주인이 증발하지 않도록, 새로 받은 정보가 없으면 기존(seatData) 정보를 유지!
    let updateData = {
      status: newStatus,
      userId: (newStatus === 'AVAILABLE') ? null : (userId || seatData?.userId || null),
      userName: (newStatus === 'AVAILABLE') ? null : (userName || seatData?.userName || null), 
      updatedAt: serverTimestamp() 
    };

    let actionType = '';
    let resultMessage = '';
    let actualUsedMinutes = 0; // ⏱️ 실제 쓴 시간(분)

    if (newStatus === 'RESERVED') {
      updateData.reservedHours = hours;  
      updateData.reminderMinutes = reminderMinutes; 
      actionType = 'RESERVE';
      resultMessage = '좌석 예약 성공';

    } else if (newStatus === 'OCCUPIED') {
      // 🚨 2. 입실 시간 보호: 이미 시간이 찍혀있으면 또 덮어씌우지 않음!
      if (!seatData?.startedAt) {
        updateData.startedAt = serverTimestamp(); 
      }
      actionType = 'CHECK_IN';
      resultMessage = '정상 입실 처리';

    } else if (newStatus === 'AVAILABLE') {
      // 🚨 3. 퇴실 시 실제 쓴 시간 계산
      if (seatData?.startedAt) {
        const startTime = seatData.startedAt.toDate ? seatData.startedAt.toDate() : new Date(seatData.startedAt);
        const endTime = new Date();
        actualUsedMinutes = Math.floor((endTime - startTime) / (1000 * 60)); 
        if (actualUsedMinutes < 0) actualUsedMinutes = 0; // 마이너스 방지
      }

      // 자리 초기화
      updateData.startedAt = null;       
      updateData.reservedHours = null;
      updateData.reminderMinutes = null;
      actionType = 'RETURN';
      resultMessage = '사용자 자진 반납';
    }

    // 1️⃣ 좌석 상태 DB 업데이트
    await updateDoc(seatRef, updateData);
    console.log(`✅ ${seatId} 상태 변경 완료!`);

    // 정보가 비어있으면 기존 좌석 데이터에서 영혼까지 끌어모음
    const targetUserId = userId || seatData?.userId;
    const targetStudentNo = studentNo || userName || seatData?.studentNo || seatData?.userName;

    // 2️⃣ 🧾 Log DB에 영수증 발급
    if (actionType && targetUserId) {
      await addDoc(collection(db, "Log"), {
        action: actionType,
        seatId: seatId,
        seatLabel: seatId, 
        uid: targetUserId,
        studentNo: targetStudentNo || "", 
        result: resultMessage,
        usedMinutes: actualUsedMinutes, // 👉 진짜 쓴 시간 기록
        createdAt: serverTimestamp(),
        // 💡 덤: 혹시 나중에 쓸지 모르니 로그에도 입실 시간을 남겨둡니다
        startedAt: seatData?.startedAt || null 
      });
      console.log(`🧾 [Log Saved] ${actionType}: SUCCESS (이용시간: ${actualUsedMinutes}분)`);
    }

  } catch (error) {
    console.error("❌ 업데이트 실패:", error);
  }
};