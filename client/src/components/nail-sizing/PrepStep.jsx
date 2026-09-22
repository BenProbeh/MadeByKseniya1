export default function PrepStep({ onNext }) {
  return (
    <div className="glass-panel p-6 md:p-8 space-y-6">
      <div className="space-y-3 text-white/70 leading-relaxed text-sm md:text-base">
        <p>המדידה מתבצעת באמצעות מצלמת הטלפון ומטבע אמיתי לכיול קנה המידה.</p>
        <ul className="space-y-2 list-disc pr-5">
          <li>הניחי את המטבע והאצבע על משטח שטוח באותו גובה.</li>
          <li>מומלץ להסיר ציפורניים מלאכותיות או קישוטים שמסתירים את הציפורן הטבעית.</li>
          <li>התמונות משמשות למדידה בלבד — אפשר לבחור לא לשמור אותן בשרת.</li>
          <li>התוצאה היא הערכה מושכלת; תמיד אפשר לתקן ידנית או לצלם שוב.</li>
        </ul>
      </div>
      <button type="button" className="btn-violet w-full" onClick={onNext}>
        התחילי במדידה
      </button>
    </div>
  );
}
